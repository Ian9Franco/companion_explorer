using Microsoft.Data.Sqlite;

namespace CompanionExplorer.Core.Catalog;

public sealed partial class CatalogStore
{
    public const int MaxPageSize = 1000;

    public CatalogPage QueryFiles(
        CatalogFilter filter,
        CatalogSort sort = CatalogSort.Date,
        bool? descending = null,
        int offset = 0,
        int limit = 200)
    {
        var desc = descending ?? sort is CatalogSort.Date or CatalogSort.Size;
        var direction = desc ? "DESC" : "ASC";
        var orderBy = sort switch
        {
            CatalogSort.Name => $"f.name COLLATE NOCASE {direction}, f.id {direction}",
            CatalogSort.Size => $"f.size {direction}, f.id {direction}",
            CatalogSort.Type => $"f.ext {direction}, f.name COLLATE NOCASE {direction}, f.id {direction}",
            _ => $"f.modified_utc {direction}, f.id {direction}"
        };

        offset = Math.Max(0, offset);
        limit = Math.Clamp(limit, 1, MaxPageSize);

        using var connection = Open();
        var where = BuildWhere(filter, includeKind: true, includeExtensions: true, includeDates: true);

        int total;
        using (var count = Command(connection, $"SELECT COUNT(*) FROM files f {where.Sql};"))
        {
            where.Apply(count);
            total = Convert.ToInt32(count.ExecuteScalar());
        }

        var items = new List<CatalogFile>();
        using (var select = Command(connection, $"""
            SELECT f.id, f.name, f.path, f.folder, f.ext, f.kind, f.size, f.modified_utc, f.library_id
            FROM files f {where.Sql}
            ORDER BY {orderBy}
            LIMIT $limit OFFSET $offset;
            """))
        {
            where.Apply(select);
            select.Parameters.AddWithValue("$limit", limit);
            select.Parameters.AddWithValue("$offset", offset);

            using var reader = select.ExecuteReader();
            while (reader.Read())
                items.Add(ReadFile(reader));
        }

        return new CatalogPage(total, offset, items);
    }

    public CatalogSummary Summarize(CatalogFilter filter)
    {
        using var connection = Open();

        int totalCount;
        long totalBytes;
        var all = BuildWhere(filter, includeKind: true, includeExtensions: true, includeDates: true);
        using (var totals = Command(connection, $"SELECT COUNT(*), COALESCE(SUM(f.size), 0) FROM files f {all.Sql};"))
        {
            all.Apply(totals);
            using var reader = totals.ExecuteReader();
            reader.Read();
            totalCount = reader.GetInt32(0);
            totalBytes = reader.GetInt64(1);
        }

        int images = 0, videos = 0, audios = 0;
        var kindWhere = BuildWhere(filter, includeKind: false, includeExtensions: false, includeDates: true);
        using (var kinds = Command(connection, $"SELECT f.kind, COUNT(*) FROM files f {kindWhere.Sql} GROUP BY f.kind;"))
        {
            kindWhere.Apply(kinds);
            using var reader = kinds.ExecuteReader();
            while (reader.Read())
            {
                switch ((MediaKind)reader.GetInt32(0))
                {
                    case MediaKind.Image: images = reader.GetInt32(1); break;
                    case MediaKind.Video: videos = reader.GetInt32(1); break;
                    case MediaKind.Audio: audios = reader.GetInt32(1); break;
                }
            }
        }

        var extensions = new List<ExtensionCount>();
        var extWhere = BuildWhere(filter, includeKind: true, includeExtensions: false, includeDates: true);
        using (var exts = Command(connection, $"""
            SELECT f.ext, COUNT(*) AS n FROM files f {extWhere.Sql}
            GROUP BY f.ext ORDER BY n DESC, f.ext ASC;
            """))
        {
            extWhere.Apply(exts);
            using var reader = exts.ExecuteReader();
            while (reader.Read())
                extensions.Add(new ExtensionCount(reader.GetString(0), reader.GetInt32(1)));
        }

        // 'localtime' buckets by the machine's zone, the same zone the UI uses to build month ranges.
        var timeline = new List<TimelineBucket>();
        var timeWhere = BuildWhere(filter, includeKind: true, includeExtensions: true, includeDates: false);
        using (var buckets = Command(connection, $"""
            SELECT
                CAST(strftime('%Y', f.modified_utc / 1000, 'unixepoch', 'localtime') AS INTEGER) AS y,
                CAST(strftime('%m', f.modified_utc / 1000, 'unixepoch', 'localtime') AS INTEGER) AS m,
                COUNT(*)
            FROM files f {timeWhere.Sql}
            GROUP BY y, m
            ORDER BY y DESC, m DESC;
            """))
        {
            timeWhere.Apply(buckets);
            using var reader = buckets.ExecuteReader();
            while (reader.Read())
                timeline.Add(new TimelineBucket(reader.GetInt32(0), reader.GetInt32(1), reader.GetInt32(2)));
        }

        return new CatalogSummary(
            totalCount,
            totalBytes,
            new KindCounts(images, videos, audios),
            extensions,
            timeline);
    }

    private static CatalogFile ReadFile(SqliteDataReader reader) => new(
        Id: reader.GetInt64(0),
        Name: reader.GetString(1),
        Path: reader.GetString(2),
        Folder: reader.GetString(3),
        Extension: reader.GetString(4),
        Kind: ((MediaKind)reader.GetInt32(5)).ToWireName(),
        SizeBytes: reader.GetInt64(6),
        ModifiedUtc: DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64(7)),
        LibraryId: reader.IsDBNull(8) ? null : reader.GetInt64(8));

    /// <summary>
    /// Un mismo filtro alimenta la grilla y los controles de al lado.
    /// Cada control pide el resumen sin su propio criterio, para seguir mostrando
    /// las alternativas: el tipo ignora tipo y extensión, la extensión ignora solo
    /// la extensión, y la línea de tiempo ignora el rango de fechas.
    /// </summary>
    private static WhereClause BuildWhere(
        CatalogFilter filter,
        bool includeKind,
        bool includeExtensions,
        bool includeDates)
    {
        var clauses = new List<string>();
        var parameters = new List<KeyValuePair<string, object>>();

        if (filter.CollectionId is { } collectionId)
        {
            clauses.Add("f.id IN (SELECT file_id FROM collection_items WHERE collection_id = $collection)");
            parameters.Add(new("$collection", collectionId));
        }
        else if (filter.LibraryId is { } libraryId)
        {
            clauses.Add("f.library_id = $library");
            parameters.Add(new("$library", libraryId));
        }
        else
        {
            clauses.Add("f.library_id IS NOT NULL");
        }

        if (includeKind && filter.Kind is { } kind)
        {
            clauses.Add("f.kind = $kind");
            parameters.Add(new("$kind", (int)kind));
        }

        if (includeExtensions && filter.Extensions is { Count: > 0 } extensions)
        {
            var names = new List<string>();
            for (var i = 0; i < extensions.Count; i++)
            {
                var name = $"$ext{i}";
                names.Add(name);
                var ext = extensions[i].Trim().ToLowerInvariant();
                parameters.Add(new(name, ext.StartsWith('.') ? ext : "." + ext));
            }
            clauses.Add($"f.ext IN ({string.Join(", ", names)})");
        }

        var tokens = SearchText.Tokenize(filter.Search);
        for (var i = 0; i < tokens.Length; i++)
        {
            clauses.Add($"f.search_key LIKE $q{i} ESCAPE '\\'");
            parameters.Add(new($"$q{i}", "%" + EscapeLike(tokens[i]) + "%"));
        }

        if (includeDates && filter.FromUtcMs is { } from)
        {
            clauses.Add("f.modified_utc >= $from");
            parameters.Add(new("$from", from));
        }

        if (includeDates && filter.ToUtcMs is { } to)
        {
            clauses.Add("f.modified_utc < $to");
            parameters.Add(new("$to", to));
        }

        return new WhereClause("WHERE " + string.Join(" AND ", clauses), parameters);
    }

    private sealed record WhereClause(string Sql, IReadOnlyList<KeyValuePair<string, object>> Parameters)
    {
        public void Apply(SqliteCommand command)
        {
            foreach (var (name, value) in Parameters)
                command.Parameters.AddWithValue(name, value);
        }
    }
}
