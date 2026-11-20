using System.Text.Json;
using System.Text.Json.Serialization;

namespace CompanionExplorer.Core.Search;

public sealed class BrainSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly object _gate = new();

    public BrainSettingsStore(string dataDirectory)
    {
        if (string.IsNullOrWhiteSpace(dataDirectory))
            throw new ArgumentException("El directorio de datos es obligatorio.", nameof(dataDirectory));

        SettingsPath = Path.Combine(dataDirectory, "brain.settings.json");
    }

    public string SettingsPath { get; }

    public BrainSettings Load()
    {
        lock (_gate)
        {
            var fallbackId = DefaultBundleIdFromManifest();
            if (!File.Exists(SettingsPath))
                return BrainSettings.Local(fallbackId);

            try
            {
                var json = File.ReadAllText(SettingsPath);
                var loaded = JsonSerializer.Deserialize<BrainSettings>(json, JsonOptions);
                if (loaded is null)
                    return BrainSettings.Local(fallbackId);

                if (loaded.SchemaVersion != BrainSettings.CurrentSchemaVersion)
                    return MigrateOrDefault(loaded, fallbackId);

                return Normalize(loaded, fallbackId);
            }
            catch
            {
                return BrainSettings.Local(fallbackId);
            }
        }
    }

    public BrainSettings Save(BrainSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        if (settings.SchemaVersion != BrainSettings.CurrentSchemaVersion)
            throw new ArgumentException("Versión de ajustes no soportada.", nameof(settings));

        var fallbackId = DefaultBundleIdFromManifest();
        var normalized = Normalize(settings, fallbackId);

        if (string.Equals(normalized.Embedder, BrainSettings.EmbedderLocal, StringComparison.Ordinal))
        {
            if (!BundleExists(normalized.LocalBundleId))
                throw new ArgumentException($"No existe el bundle «{normalized.LocalBundleId}».", nameof(settings));
        }
        else if (string.Equals(normalized.Embedder, BrainSettings.EmbedderProvider, StringComparison.Ordinal))
        {
            if (normalized.Provider is null || !BrainProviderCatalog.IsKnown(normalized.Provider.ProviderId))
                throw new ArgumentException("Proveedor inválido.", nameof(settings));
            if (string.IsNullOrWhiteSpace(normalized.Provider.ModelId))
                throw new ArgumentException("Falta el modelo del proveedor.", nameof(settings));
        }
        else
        {
            throw new ArgumentException("Tipo de embedder inválido.", nameof(settings));
        }

        lock (_gate)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
            File.WriteAllText(SettingsPath, JsonSerializer.Serialize(normalized, JsonOptions));
        }

        return normalized;
    }

    public IReadOnlyList<ModelBundleSpec> ListAvailableBundles()
    {
        var manifest = ModelManifestIO.TryRead(ModelPaths.ManifestPath);
        return manifest?.Bundles ?? Array.Empty<ModelBundleSpec>();
    }

    private static BrainSettings MigrateOrDefault(BrainSettings loaded, string fallbackId)
    {
        if (loaded.SchemaVersion == 1 &&
            string.Equals(loaded.Embedder, BrainSettings.EmbedderLocal, StringComparison.Ordinal))
            return BrainSettings.Local(string.IsNullOrWhiteSpace(loaded.LocalBundleId) ? fallbackId : loaded.LocalBundleId);

        return BrainSettings.Local(fallbackId);
    }

    private static BrainSettings Normalize(BrainSettings loaded, string fallbackId)
    {
        if (string.Equals(loaded.Embedder, BrainSettings.EmbedderProvider, StringComparison.Ordinal) && loaded.Provider is not null)
            return BrainSettings.WithProvider(
                loaded.Provider,
                string.IsNullOrWhiteSpace(loaded.LocalBundleId) ? fallbackId : loaded.LocalBundleId);

        var bundleId = string.IsNullOrWhiteSpace(loaded.LocalBundleId) ? fallbackId : loaded.LocalBundleId;
        if (!BundleExists(bundleId))
            bundleId = fallbackId;

        return BrainSettings.Local(bundleId);
    }

    private static string DefaultBundleIdFromManifest()
    {
        var manifest = ModelManifestIO.TryRead(ModelPaths.ManifestPath);
        if (manifest is not null && !string.IsNullOrWhiteSpace(manifest.DefaultModelId))
            return manifest.DefaultModelId.Trim();
        return "companion-brain-v1";
    }

    private static bool BundleExists(string bundleId) =>
        ModelManifestIO.TryRead(ModelPaths.ManifestPath)?.Bundles.Any(b =>
            string.Equals(b.Id, bundleId, StringComparison.OrdinalIgnoreCase)) == true;
}