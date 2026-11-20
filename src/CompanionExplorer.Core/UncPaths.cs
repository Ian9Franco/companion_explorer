namespace CompanionExplorer.Core;

/// <summary>
/// Rutas UNC de Windows (<c>\\servidor\recurso\carpeta</c>). <c>\\</c> es la red, no un directorio.
/// </summary>
public static class UncPaths
{
    public const string Root = @"\\";

    public static bool IsUnc(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return false;

        var normalized = NormalizeSlashes(path);
        return normalized.StartsWith(Root, StringComparison.Ordinal);
    }

    public static bool IsRoot(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return false;

        var normalized = NormalizeSlashes(path);
        return normalized.Length > 0 && normalized.Trim('\\').Length == 0;
    }

    public static IReadOnlyList<string> Segments(string path)
    {
        if (IsRoot(path))
            return [];

        var normalized = TrimTrailingSeparators(NormalizeSlashes(path));
        var inner = normalized.StartsWith(Root, StringComparison.Ordinal) ? normalized[2..] : normalized;
        return inner.Split('\\', StringSplitOptions.RemoveEmptyEntries);
    }

    public static string Join(IReadOnlyList<string> segments)
    {
        if (segments.Count == 0)
            return Root;

        return Root + string.Join('\\', segments);
    }

    public static string? Parent(string path)
    {
        if (!IsUnc(path) || IsRoot(path))
            return null;

        var segments = Segments(path);
        if (segments.Count <= 1)
            return Root;

        return Join(segments.Take(segments.Count - 1).ToArray());
    }

    public static IReadOnlyList<BreadcrumbEntry> Breadcrumbs(string path)
    {
        var crumbs = new List<BreadcrumbEntry> { new("Red", Root) };
        var segments = Segments(path);
        for (var i = 0; i < segments.Count; i++)
            crumbs.Add(new BreadcrumbEntry(segments[i], Join(segments.Take(i + 1).ToArray())));

        return crumbs;
    }

    public static string Canonical(string path)
    {
        if (IsRoot(path))
            return Root;

        return Join(Segments(path));
    }

    private static string NormalizeSlashes(string path) =>
        path.Trim().Trim('"').Replace('/', '\\');

    private static string TrimTrailingSeparators(string path)
    {
        var trimmed = path;
        while (trimmed.Length > 2 && trimmed.EndsWith('\\'))
            trimmed = trimmed[..^1];
        return trimmed;
    }
}
