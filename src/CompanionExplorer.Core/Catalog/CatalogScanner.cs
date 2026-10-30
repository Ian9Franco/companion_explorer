using Microsoft.Data.Sqlite;

namespace CompanionExplorer.Core.Catalog;

public sealed class CatalogScanner(CatalogStore store)
{
    private const int CommitEvery = 1000;
    private const int ReportEvery = 200;

    private static readonly EnumerationOptions FlatOptions = new()
    {
        IgnoreInaccessible = true,
        ReturnSpecialDirectories = false,
        RecurseSubdirectories = false,
        AttributesToSkip = FileAttributes.Hidden | FileAttributes.System
    };

    /// <summary>
    /// Walks the library and upserts every media file. Rows that this walk did not see
    /// are deleted afterwards, so a rescan also catches renames and deletions.
    /// A cancelled scan keeps what it already wrote and deletes nothing.
    /// </summary>
    public ScanResult Scan(long libraryId, IProgress<int>? progress = null, CancellationToken cancellationToken = default)
    {
        var library = store.GetLibrary(libraryId)
            ?? throw new KeyNotFoundException($"No existe la biblioteca {libraryId}.");

        var root = new DirectoryInfo(library.Path);
        if (!root.Exists)
            return new ScanResult(0, 0, 0, Completed: false);

        var scanId = DateTime.UtcNow.Ticks;
        var indexed = 0;
        long totalBytes = 0;

        using var connection = store.Open();
        var transaction = connection.BeginTransaction();
        using var upsert = CreateUpsert(connection, transaction, libraryId, scanId);

        try
        {
            foreach (var file in Walk(root, cancellationToken))
            {
                if (!MediaTypes.TryGetKind(file.Extension, out var kind))
                    continue;

                long length;
                long modified;
                try
                {
                    length = file.Length;
                    modified = new DateTimeOffset(file.LastWriteTimeUtc, TimeSpan.Zero).ToUnixTimeMilliseconds();
                }
                catch (IOException)
                {
                    continue;
                }
                catch (UnauthorizedAccessException)
                {
                    continue;
                }

                upsert.Parameters["$path"].Value = file.FullName;
                upsert.Parameters["$folder"].Value = file.DirectoryName ?? string.Empty;
                upsert.Parameters["$name"].Value = file.Name;
                upsert.Parameters["$ext"].Value = file.Extension.ToLowerInvariant();
                upsert.Parameters["$kind"].Value = (int)kind;
                upsert.Parameters["$size"].Value = length;
                upsert.Parameters["$modified"].Value = modified;
                upsert.Parameters["$key"].Value = SearchText.Normalize(Path.GetRelativePath(root.FullName, file.FullName));
                upsert.ExecuteNonQuery();

                indexed++;
                totalBytes += length;

                if (indexed % CommitEvery == 0)
                {
                    transaction.Commit();
                    transaction.Dispose();
                    transaction = connection.BeginTransaction();
                    upsert.Transaction = transaction;
                }

                if (indexed % ReportEvery == 0)
                    progress?.Report(indexed);
            }

            int removed;
            using (var prune = CatalogStore.Command(connection,
                "DELETE FROM files WHERE library_id = $library AND scan_id <> $scan;", transaction))
            {
                prune.Parameters.AddWithValue("$library", libraryId);
                prune.Parameters.AddWithValue("$scan", scanId);
                removed = prune.ExecuteNonQuery();
            }

            CatalogStore.RefreshLibraryStats(connection, transaction, libraryId, touchScanTime: true);
            transaction.Commit();
            progress?.Report(indexed);
            return new ScanResult(indexed, removed, totalBytes, Completed: true);
        }
        catch (OperationCanceledException)
        {
            transaction.Commit();
            return new ScanResult(indexed, 0, totalBytes, Completed: false);
        }
        finally
        {
            transaction.Dispose();
        }
    }

    /// <summary>
    /// Directory links are not followed: a junction or symlink back up the tree would loop.
    /// Files that are reparse points (OneDrive placeholders) are still listed.
    /// </summary>
    private static IEnumerable<FileInfo> Walk(DirectoryInfo root, CancellationToken cancellationToken)
    {
        var pending = new Stack<DirectoryInfo>();
        pending.Push(root);

        while (pending.Count > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var directory = pending.Pop();

            List<FileSystemInfo> entries;
            try
            {
                entries = directory.EnumerateFileSystemInfos("*", FlatOptions).ToList();
            }
            catch (IOException)
            {
                continue;
            }
            catch (UnauthorizedAccessException)
            {
                continue;
            }

            foreach (var entry in entries)
            {
                if (entry.Name.StartsWith('.'))
                    continue;

                if (entry is DirectoryInfo subdirectory)
                {
                    if (!subdirectory.Attributes.HasFlag(FileAttributes.ReparsePoint))
                        pending.Push(subdirectory);
                }
                else if (entry is FileInfo file)
                {
                    yield return file;
                }
            }
        }
    }

    private static SqliteCommand CreateUpsert(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long libraryId,
        long scanId)
    {
        var command = CatalogStore.Command(connection, """
            INSERT INTO files (library_id, path, folder, name, ext, kind, size, modified_utc, search_key, scan_id)
            VALUES ($library, $path, $folder, $name, $ext, $kind, $size, $modified, $key, $scan)
            ON CONFLICT(path) DO UPDATE SET
                library_id = excluded.library_id,
                folder = excluded.folder,
                name = excluded.name,
                ext = excluded.ext,
                kind = excluded.kind,
                size = excluded.size,
                modified_utc = excluded.modified_utc,
                search_key = excluded.search_key,
                scan_id = excluded.scan_id;
            """, transaction);

        command.Parameters.AddWithValue("$library", libraryId);
        command.Parameters.AddWithValue("$scan", scanId);
        foreach (var name in new[] { "$path", "$folder", "$name", "$ext", "$key" })
            command.Parameters.Add(name, SqliteType.Text);
        foreach (var name in new[] { "$kind", "$size", "$modified" })
            command.Parameters.Add(name, SqliteType.Integer);

        command.Prepare();
        return command;
    }
}
