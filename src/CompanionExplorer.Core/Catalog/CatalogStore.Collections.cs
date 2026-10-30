using Microsoft.Data.Sqlite;

namespace CompanionExplorer.Core.Catalog;

public sealed partial class CatalogStore
{
    public IReadOnlyList<CollectionRecord> ListCollections()
    {
        using var connection = Open();
        return ReadCollections(connection, null);
    }

    public CollectionRecord? GetCollection(long id)
    {
        using var connection = Open();
        return ReadCollections(connection, id).FirstOrDefault();
    }

    public CollectionRecord CreateCollection(string name)
    {
        var trimmed = ValidateCollectionName(name);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        using var connection = Open();
        long id;
        using (var insert = Command(connection, """
            INSERT INTO collections (name, created_utc, updated_utc) VALUES ($name, $now, $now)
            RETURNING id;
            """))
        {
            insert.Parameters.AddWithValue("$name", trimmed);
            insert.Parameters.AddWithValue("$now", now);
            id = Convert.ToInt64(insert.ExecuteScalar());
        }

        return ReadCollections(connection, id).Single();
    }

    public CollectionRecord? RenameCollection(long id, string name)
    {
        var trimmed = ValidateCollectionName(name);
        using var connection = Open();
        using var update = Command(connection, "UPDATE collections SET name = $name, updated_utc = $now WHERE id = $id;");
        update.Parameters.AddWithValue("$name", trimmed);
        update.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        update.Parameters.AddWithValue("$id", id);
        if (update.ExecuteNonQuery() == 0)
            return null;
        return ReadCollections(connection, id).Single();
    }

    /// <summary>
    /// Deletes the collection and its membership rows. The files stay where they are,
    /// on disk and in their libraries.
    /// </summary>
    public bool DeleteCollection(long id)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();

        int removed;
        using (var delete = Command(connection, "DELETE FROM collections WHERE id = $id;", transaction))
        {
            delete.Parameters.AddWithValue("$id", id);
            removed = delete.ExecuteNonQuery();
        }

        PruneOrphanFiles(connection, transaction);
        transaction.Commit();
        return removed > 0;
    }

    /// <summary>
    /// Adds files by path. A media file outside every library is cataloged on the spot,
    /// so a collection can hold files from folders that were only browsed.
    /// </summary>
    public int AddToCollection(long collectionId, IEnumerable<string> paths)
    {
        using var connection = Open();
        var libraries = ReadLibraries(connection, null);
        using var transaction = connection.BeginTransaction();
        EnsureCollectionExists(connection, transaction, collectionId);

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var added = 0;

        foreach (var raw in paths.Distinct())
        {
            if (string.IsNullOrWhiteSpace(raw))
                continue;

            var fileId = FindOrCatalogFile(connection, transaction, FolderExplorer.NormalizePath(raw), libraries);
            if (fileId is null)
                continue;

            using var insert = Command(connection, """
                INSERT OR IGNORE INTO collection_items (collection_id, file_id, added_utc)
                VALUES ($collection, $file, $now);
                """, transaction);
            insert.Parameters.AddWithValue("$collection", collectionId);
            insert.Parameters.AddWithValue("$file", fileId.Value);
            insert.Parameters.AddWithValue("$now", now);
            added += insert.ExecuteNonQuery();
        }

        TouchCollection(connection, transaction, collectionId, now);
        transaction.Commit();
        return added;
    }

    public int RemoveFromCollection(long collectionId, IEnumerable<string> paths)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();
        EnsureCollectionExists(connection, transaction, collectionId);

        var removed = 0;
        foreach (var raw in paths.Distinct())
        {
            if (string.IsNullOrWhiteSpace(raw))
                continue;

            using var delete = Command(connection, """
                DELETE FROM collection_items
                WHERE collection_id = $collection
                  AND file_id = (SELECT id FROM files WHERE path = $path);
                """, transaction);
            delete.Parameters.AddWithValue("$collection", collectionId);
            delete.Parameters.AddWithValue("$path", FolderExplorer.NormalizePath(raw));
            removed += delete.ExecuteNonQuery();
        }

        PruneOrphanFiles(connection, transaction);
        TouchCollection(connection, transaction, collectionId, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        transaction.Commit();
        return removed;
    }

    private static long? FindOrCatalogFile(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string fullPath,
        IReadOnlyList<LibraryRecord> libraries)
    {
        using (var find = Command(connection, "SELECT id FROM files WHERE path = $path;", transaction))
        {
            find.Parameters.AddWithValue("$path", fullPath);
            if (find.ExecuteScalar() is long existing)
                return existing;
        }

        var info = new FileInfo(fullPath);
        if (!info.Exists || !MediaTypes.TryGetKind(info.Extension, out var kind))
            return null;

        var owner = libraries.FirstOrDefault(l => IsInside(fullPath, l.Path));
        var searchRoot = owner?.Path ?? info.Directory?.Parent?.FullName ?? info.DirectoryName ?? fullPath;

        using var insert = Command(connection, """
            INSERT INTO files (library_id, path, folder, name, ext, kind, size, modified_utc, search_key, scan_id)
            VALUES ($library, $path, $folder, $name, $ext, $kind, $size, $modified, $key, 0)
            RETURNING id;
            """, transaction);
        insert.Parameters.AddWithValue("$library", (object?)owner?.Id ?? DBNull.Value);
        insert.Parameters.AddWithValue("$path", info.FullName);
        insert.Parameters.AddWithValue("$folder", info.DirectoryName ?? string.Empty);
        insert.Parameters.AddWithValue("$name", info.Name);
        insert.Parameters.AddWithValue("$ext", info.Extension.ToLowerInvariant());
        insert.Parameters.AddWithValue("$kind", (int)kind);
        insert.Parameters.AddWithValue("$size", info.Length);
        insert.Parameters.AddWithValue("$modified", new DateTimeOffset(info.LastWriteTimeUtc, TimeSpan.Zero).ToUnixTimeMilliseconds());
        insert.Parameters.AddWithValue("$key", SearchText.Normalize(Path.GetRelativePath(searchRoot, info.FullName)));
        return Convert.ToInt64(insert.ExecuteScalar());
    }

    /// <summary>
    /// A file outside every library only exists in the catalog because a collection holds it.
    /// </summary>
    private static void PruneOrphanFiles(SqliteConnection connection, SqliteTransaction transaction)
    {
        using var prune = Command(connection, """
            DELETE FROM files
            WHERE library_id IS NULL AND id NOT IN (SELECT file_id FROM collection_items);
            """, transaction);
        prune.ExecuteNonQuery();
    }

    private static void EnsureCollectionExists(SqliteConnection connection, SqliteTransaction transaction, long id)
    {
        using var exists = Command(connection, "SELECT 1 FROM collections WHERE id = $id;", transaction);
        exists.Parameters.AddWithValue("$id", id);
        if (exists.ExecuteScalar() is null)
            throw new KeyNotFoundException($"No existe la colección {id}.");
    }

    private static void TouchCollection(SqliteConnection connection, SqliteTransaction transaction, long id, long now)
    {
        using var touch = Command(connection, "UPDATE collections SET updated_utc = $now WHERE id = $id;", transaction);
        touch.Parameters.AddWithValue("$now", now);
        touch.Parameters.AddWithValue("$id", id);
        touch.ExecuteNonQuery();
    }

    private static string ValidateCollectionName(string name)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length == 0)
            throw new ArgumentException("La colección necesita un nombre.", nameof(name));
        if (trimmed.Length > 80)
            throw new ArgumentException("El nombre de la colección puede tener hasta 80 caracteres.", nameof(name));
        return trimmed;
    }

    private static List<CollectionRecord> ReadCollections(SqliteConnection connection, long? id)
    {
        var filter = id is null ? string.Empty : "WHERE c.id = $id";
        using var command = Command(connection, $"""
            SELECT
                c.id, c.name, c.created_utc, c.updated_utc,
                (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id),
                (SELECT f.path FROM collection_items ci JOIN files f ON f.id = ci.file_id
                 WHERE ci.collection_id = c.id AND f.kind IN (0, 1)
                 ORDER BY ci.added_utc DESC, f.id DESC LIMIT 1)
            FROM collections c {filter}
            ORDER BY c.name COLLATE NOCASE;
            """);
        if (id is not null)
            command.Parameters.AddWithValue("$id", id.Value);

        var list = new List<CollectionRecord>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new CollectionRecord(
                Id: reader.GetInt64(0),
                Name: reader.GetString(1),
                ItemCount: reader.GetInt32(4),
                CoverPath: reader.IsDBNull(5) ? null : reader.GetString(5),
                CreatedUtc: DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64(2)),
                UpdatedUtc: DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64(3))));
        }

        return list;
    }
}
