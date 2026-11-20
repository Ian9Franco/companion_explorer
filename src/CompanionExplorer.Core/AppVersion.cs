namespace CompanionExplorer.Core;

public static class AppVersion
{
    public static string Read(string? baseDirectory = null)
    {
        var root = string.IsNullOrWhiteSpace(baseDirectory) ? AppContext.BaseDirectory : baseDirectory;
        var path = Path.Combine(root, "version.txt");
        if (!File.Exists(path))
            return "0.0.0";

        var text = File.ReadAllText(path).Trim().TrimStart('v', 'V');
        return string.IsNullOrWhiteSpace(text) ? "0.0.0" : text;
    }

    public static bool IsNewer(string latest, string current)
    {
        return Compare(latest, current) > 0;
    }

    public static int Compare(string left, string right)
    {
        var a = Parse(left);
        var b = Parse(right);
        var length = Math.Max(a.Length, b.Length);
        for (var i = 0; i < length; i++)
        {
            var av = i < a.Length ? a[i] : 0;
            var bv = i < b.Length ? b[i] : 0;
            if (av != bv)
                return av.CompareTo(bv);
        }

        return 0;
    }

    private static int[] Parse(string version)
    {
        var trimmed = version.Trim().TrimStart('v', 'V');
        var core = trimmed.Split('-', '+')[0];
        return core.Split('.', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => int.TryParse(part, out var value) ? value : 0)
            .ToArray();
    }
}