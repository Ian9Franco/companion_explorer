namespace CompanionExplorer.Core;

/// <summary>
/// Dónde guarda la app lo suyo: <c>catalog.db</c> y <c>cache/thumbs</c>.
/// Primero <c>COMPANION_DATA_DIR</c>, si no <c>%LocalAppData%/CompanionExplorer</c>.
/// </summary>
public static class AppDataPaths
{
    public static string Resolve(string? overrideDirectory = null)
    {
        var configured = string.IsNullOrWhiteSpace(overrideDirectory)
            ? Environment.GetEnvironmentVariable("COMPANION_DATA_DIR")
            : overrideDirectory;

        if (!string.IsNullOrWhiteSpace(configured))
            return Path.GetFullPath(configured);

        var baseDir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(baseDir))
            baseDir = Path.GetTempPath();

        return Path.Combine(baseDir, "CompanionExplorer");
    }
}
