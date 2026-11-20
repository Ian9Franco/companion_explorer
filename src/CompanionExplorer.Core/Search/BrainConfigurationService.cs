namespace CompanionExplorer.Core.Search;

public sealed class BrainConfigurationService
{
    private readonly BrainSettingsStore _store;
    private readonly EmbedderRegistry _registry;
    private readonly ModelInstaller _installer;

    public BrainConfigurationService(
        BrainSettingsStore store,
        EmbedderRegistry registry,
        ModelInstaller installer)
    {
        _store = store;
        _registry = registry;
        _installer = installer;
    }

    public BrainSettingsView GetView()
    {
        var settings = _registry.CurrentSettings;
        var bundles = _store.ListAvailableBundles()
            .Select(b => new BrainBundleOption(
                b.Id,
                b.Label,
                b.Dimensions,
                ModelManifestIO.BundleIsComplete(b)))
            .ToList();

        var providerOption = settings.Provider is null
            ? null
            : BrainProviderCatalog.Find(settings.Provider.ProviderId);

        return new BrainSettingsView(
            SchemaVersion: settings.SchemaVersion,
            Embedder: settings.Embedder,
            LocalBundleId: settings.LocalBundleId,
            Provider: settings.Provider,
            ProviderKeyConfigured: BrainProviderCredentials.HasApiKey(),
            ProviderImplemented: providerOption?.Implemented ?? false,
            SettingsPath: _store.SettingsPath,
            AvailableBundles: bundles,
            ProviderOptions: BrainProviderCatalog.All);
    }

    public async Task<BrainSettingsView> ApplyPatchAsync(BrainSettingsPatch patch, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(patch);
        var current = _registry.CurrentSettings;
        var fallbackBundle = DefaultBundleId();

        var embedder = NormalizeEmbedder(patch.Embedder) ?? current.Embedder;
        var localBundleId = string.IsNullOrWhiteSpace(patch.LocalBundleId)
            ? current.LocalBundleId
            : patch.LocalBundleId.Trim();

        if (!BundleExists(localBundleId))
            throw new ArgumentException($"No existe el bundle «{localBundleId}».", nameof(patch));

        BrainSettings next;
        if (string.Equals(embedder, BrainSettings.EmbedderProvider, StringComparison.Ordinal))
        {
            var provider = patch.Provider ?? current.Provider;
            if (provider is null || string.IsNullOrWhiteSpace(provider.ProviderId) || string.IsNullOrWhiteSpace(provider.ModelId))
                throw new ArgumentException("Elegí proveedor y modelo.", nameof(patch));

            if (!BrainProviderCatalog.IsKnown(provider.ProviderId))
                throw new ArgumentException($"Proveedor desconocido: «{provider.ProviderId}».", nameof(patch));

            next = BrainSettings.WithProvider(provider, localBundleId);
        }
        else
        {
            next = BrainSettings.Local(localBundleId);
        }

        _registry.ApplySettings(next);

        if (string.Equals(next.Embedder, BrainSettings.EmbedderLocal, StringComparison.Ordinal))
            await _installer.EnsureBundleAsync(next.LocalBundleId, cancellationToken);
        _registry.Reload();

        return GetView();
    }

    private static string? NormalizeEmbedder(string? embedder)
    {
        if (string.IsNullOrWhiteSpace(embedder))
            return null;

        var value = embedder.Trim().ToLowerInvariant();
        return value is BrainSettings.EmbedderLocal or BrainSettings.EmbedderProvider ? value : null;
    }

    private static string DefaultBundleId()
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