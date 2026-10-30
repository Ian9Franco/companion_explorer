using Microsoft.Data.Sqlite;

namespace CompanionExplorer.Core.Catalog;

/// <summary>
/// Catálogo SQLite. Vive en el directorio de datos de la app, nunca en una carpeta del usuario.
/// Una fila de <c>files</c> pertenece a una biblioteca, o a ninguna si solo la sostiene una
/// colección (<c>library_id</c> nulo). La vista "todo" deja afuera esas filas sueltas.
/// El esquema avanza con <c>PRAGMA user_version</c>. Hoy hay una sola versión.
/// </summary>
public sealed partial class CatalogStore
{
    private const int SchemaVersion = 1;

    internal static readonly StringComparison PathComparison =
        OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;

    private readonly string _connectionString;

    public CatalogStore(string databasePath)
    {
        DatabasePath = Path.GetFullPath(databasePath);
        Directory.CreateDirectory(Path.GetDirectoryName(DatabasePath)!);

        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = DatabasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            ForeignKeys = true,
            Pooling = true,
            DefaultTimeout = 30
        }.ToString();

        Migrate();
    }

    public string DatabasePath { get; }

    internal SqliteConnection Open()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        Execute(connection, "PRAGMA busy_timeout = 5000;");
        return connection;
    }

    private void Migrate()
    {
        using var connection = Open();
        Execute(connection, "PRAGMA journal_mode = WAL;");

        var version = Convert.ToInt32(Scalar(connection, "PRAGMA user_version;"));
        if (version >= SchemaVersion)
            return;

        // Windows paths are case-insensitive; elsewhere two names that differ in case are two files.
        var pathCollation = OperatingSystem.IsWindows() ? " COLLATE NOCASE" : string.Empty;

        using var transaction = connection.BeginTransaction();
        Execute(connection, $"""
            CREATE TABLE IF NOT EXISTS libraries (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL UNIQUE{pathCollation},
                name TEXT NOT NULL,
                added_utc INTEGER NOT NULL,
                last_scan_utc INTEGER,
                file_count INTEGER NOT NULL DEFAULT 0,
                total_bytes INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY,
                library_id INTEGER REFERENCES libraries(id) ON DELETE SET NULL,
                path TEXT NOT NULL UNIQUE{pathCollation},
                folder TEXT NOT NULL,
                name TEXT NOT NULL,
                ext TEXT NOT NULL,
                kind INTEGER NOT NULL,
                size INTEGER NOT NULL,
                modified_utc INTEGER NOT NULL,
                search_key TEXT NOT NULL,
                scan_id INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS ix_files_library_modified ON files(library_id, modified_utc DESC);
            CREATE INDEX IF NOT EXISTS ix_files_modified ON files(modified_utc DESC);
            CREATE INDEX IF NOT EXISTS ix_files_kind_modified ON files(kind, modified_utc DESC);

            CREATE TABLE IF NOT EXISTS collections (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                created_utc INTEGER NOT NULL,
                updated_utc INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS collection_items (
                collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
                file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                added_utc INTEGER NOT NULL,
                PRIMARY KEY (collection_id, file_id)
            );

            CREATE INDEX IF NOT EXISTS ix_collection_items_file ON collection_items(file_id);
            """, transaction);
        Execute(connection, $"PRAGMA user_version = {SchemaVersion};", transaction);
        transaction.Commit();
    }

    public IReadOnlyList<LibraryRecord> ListLibraries()
    {
        using var connection = Open();
        return ReadLibraries(connection, null);
    }

    public LibraryRecord? GetLibrary(long id)
    {
        using var connection = Open();
        return ReadLibraries(connection, id).FirstOrDefault();
    }

    public LibraryAddResult AddLibrary(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("La ruta de la biblioteca es obligatoria.", nameof(path));

        var normalized = NormalizeDirectory(path);
        if (!Directory.Exists(normalized))
            throw new DirectoryNotFoundException($"No existe la carpeta '{normalized}'.");

        using var connection = Open();
        var existing = ReadLibraries(connection, null);

        var same = existing.FirstOrDefault(l => string.Equals(l.Path, normalized, PathComparison));
        if (same is not null)
            return new LibraryAddResult(same, Created: false, AbsorbedLibraryIds: []);

        var parent = existing.FirstOrDefault(l => IsInside(normalized, l.Path));
        if (parent is not null)
            throw new CatalogConflictException($"Esa carpeta ya está dentro de la biblioteca «{parent.Name}».");

        var children = existing.Where(l => IsInside(l.Path, normalized)).ToList();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        using var transaction = connection.BeginTransaction();
        long newId;
        using (var insert = Command(connection, """
            INSERT INTO libraries (path, name, added_utc) VALUES ($path, $name, $now)
            RETURNING id;
            """, transaction))
        {
            insert.Parameters.AddWithValue("$path", normalized);
            insert.Parameters.AddWithValue("$name", DisplayName(normalized));
            insert.Parameters.AddWithValue("$now", now);
            newId = Convert.ToInt64(insert.ExecuteScalar());
        }

        foreach (var child in children)
        {
            using var move = Command(connection, "UPDATE files SET library_id = $new WHERE library_id = $old;", transaction);
            move.Parameters.AddWithValue("$new", newId);
            move.Parameters.AddWithValue("$old", child.Id);
            move.ExecuteNonQuery();

            using var delete = Command(connection, "DELETE FROM libraries WHERE id = $old;", transaction);
            delete.Parameters.AddWithValue("$old", child.Id);
            delete.ExecuteNonQuery();
        }

        // Files that were only in collections become part of the library that now contains them.
        using (var adopt = Command(connection, """
            UPDATE files SET library_id = $new
            WHERE library_id IS NULL AND (path LIKE $prefix ESCAPE '\')
            """, transaction))
        {
            adopt.Parameters.AddWithValue("$new", newId);
            adopt.Parameters.AddWithValue("$prefix", EscapeLike(WithTrailingSeparator(normalized)) + "%");
            adopt.ExecuteNonQuery();
        }

        RefreshLibraryStats(connection, transaction, newId, touchScanTime: false);
        transaction.Commit();

        var created = ReadLibraries(connection, newId).Single();
        return new LibraryAddResult(created, Created: true, AbsorbedLibraryIds: children.Select(c => c.Id).ToList());
    }

    /// <summary>
    /// Removes the library from the catalog. Nothing is deleted from disk, and files
    /// that belong to a collection stay in the catalog so the collection keeps them.
    /// </summary>
    public bool RemoveLibrary(long id)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();

        using (var detach = Command(connection, """
            UPDATE files SET library_id = NULL
            WHERE library_id = $id AND id IN (SELECT file_id FROM collection_items)
            """, transaction))
        {
            detach.Parameters.AddWithValue("$id", id);
            detach.ExecuteNonQuery();
        }

        using (var deleteFiles = Command(connection, "DELETE FROM files WHERE library_id = $id;", transaction))
        {
            deleteFiles.Parameters.AddWithValue("$id", id);
            deleteFiles.ExecuteNonQuery();
        }

        int removed;
        using (var deleteLibrary = Command(connection, "DELETE FROM libraries WHERE id = $id;", transaction))
        {
            deleteLibrary.Parameters.AddWithValue("$id", id);
            removed = deleteLibrary.ExecuteNonQuery();
        }

        transaction.Commit();
        return removed > 0;
    }

    internal static void RefreshLibraryStats(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long libraryId,
        bool touchScanTime)
    {
        var scanClause = touchScanTime ? ", last_scan_utc = $now" : string.Empty;
        using var update = Command(connection, $"""
            UPDATE libraries SET
                file_count = (SELECT COUNT(*) FROM files WHERE library_id = $id),
                total_bytes = (SELECT COALESCE(SUM(size), 0) FROM files WHERE library_id = $id){scanClause}
            WHERE id = $id;
            """, transaction);
        update.Parameters.AddWithValue("$id", libraryId);
        update.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        update.ExecuteNonQuery();
    }

    private static List<LibraryRecord> ReadLibraries(SqliteConnection connection, long? id)
    {
        using var command = Command(connection, id is null
            ? "SELECT id, path, name, added_utc, last_scan_utc, file_count, total_bytes FROM libraries ORDER BY name COLLATE NOCASE;"
            : "SELECT id, path, name, added_utc, last_scan_utc, file_count, total_bytes FROM libraries WHERE id = $id;");
        if (id is not null)
            command.Parameters.AddWithValue("$id", id.Value);

        var list = new List<LibraryRecord>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new LibraryRecord(
                Id: reader.GetInt64(0),
                Path: reader.GetString(1),
                Name: reader.GetString(2),
                AddedUtc: DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64(3)),
                LastScanUtc: reader.IsDBNull(4) ? null : DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64(4)),
                FileCount: reader.GetInt32(5),
                TotalBytes: reader.GetInt64(6)));
        }

        return list;
    }

    internal static string NormalizeDirectory(string path)
    {
        var full = FolderExplorer.NormalizePath(path);
        var root = Path.GetPathRoot(full);
        return string.Equals(full, root, PathComparison) ? full : Path.TrimEndingDirectorySeparator(full);
    }

    internal static bool IsInside(string candidate, string parent)
    {
        if (string.Equals(candidate, parent, PathComparison))
            return false;
        return candidate.StartsWith(WithTrailingSeparator(parent), PathComparison);
    }

    internal static string WithTrailingSeparator(string path) =>
        Path.EndsInDirectorySeparator(path) ? path : path + Path.DirectorySeparatorChar;

    internal static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");

    private static string DisplayName(string path)
    {
        var name = Path.GetFileName(Path.TrimEndingDirectorySeparator(path));
        return string.IsNullOrEmpty(name) ? path : name;
    }

    internal static SqliteCommand Command(SqliteConnection connection, string sql, SqliteTransaction? transaction = null)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Transaction = transaction;
        return command;
    }

    private static void Execute(SqliteConnection connection, string sql, SqliteTransaction? transaction = null)
    {
        using var command = Command(connection, sql, transaction);
        command.ExecuteNonQuery();
    }

    private static object? Scalar(SqliteConnection connection, string sql)
    {
        using var command = Command(connection, sql);
        return command.ExecuteScalar();
    }
}
