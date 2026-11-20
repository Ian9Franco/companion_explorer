namespace CompanionExplorer.Core.Search;

/// <summary>
/// Modelos ONNX viven junto a la instalación portable (<c>{install}/models/</c>),
/// no mezclados con <see cref="AppDataPaths"/> (catálogo y miniaturas).
/// </summary>
public static class ModelPaths
{
    public const string ModelsFolderName = "models";

    /// <summary>
    /// Raíz del release (carpeta del ZIP) o override explícito.
    /// </summary>
    public static string ResolveInstallRoot()
    {
        var configured = Environment.GetEnvironmentVariable("COMPANION_INSTALL_DIR");
        if (!string.IsNullOrWhiteSpace(configured))
            return Path.GetFullPath(configured.Trim());

        var apiBase = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var parent = Directory.GetParent(apiBase)?.FullName;
        if (!string.IsNullOrWhiteSpace(parent) && LooksLikeInstallRoot(parent))
            return parent;

        // Desarrollo: misma carpeta de datos, subcarpeta models (un solo lugar, no el disco del usuario).
        return AppDataPaths.Resolve();
    }

    public static string ModelsDirectory => Path.Combine(ResolveInstallRoot(), ModelsFolderName);

    public static string ManifestPath => Path.Combine(ModelsDirectory, "manifest.json");

    public static string BundleDirectory(string bundleId) =>
        Path.Combine(ModelsDirectory, bundleId.Trim());

    private static bool LooksLikeInstallRoot(string directory)
    {
        if (File.Exists(Path.Combine(directory, "Start-Companion.bat")))
            return true;
        if (File.Exists(Path.Combine(directory, "CompanionExplorer.Host.exe")))
            return true;
        if (Directory.Exists(Path.Combine(directory, ModelsFolderName)))
            return true;
        return false;
    }
}