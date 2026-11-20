namespace CompanionExplorer.Core.Search;

/// <summary>
/// Resuelve el <see cref="IEmbedder"/> activo según <see cref="BrainSettings"/>.
/// </summary>
public sealed class EmbedderRegistry : IEmbedder
{
    private readonly BrainSettingsStore _settingsStore;
    private readonly object _gate = new();
    private IEmbedder _active = new NullEmbedder();
    private BrainSettings _settings;

    public EmbedderRegistry(BrainSettingsStore settingsStore)
    {
        _settingsStore = settingsStore;
        _settings = settingsStore.Load();
        Reload();
    }

    public BrainSettings CurrentSettings
    {
        get
        {
            lock (_gate)
                return _settings;
        }
    }

    public EmbeddingModel Model
    {
        get
        {
            lock (_gate)
                return _active.Model;
        }
    }

    public bool IsReady
    {
        get
        {
            lock (_gate)
                return _active.IsReady;
        }
    }

    public BrainSettings ApplySettings(BrainSettings settings)
    {
        var saved = _settingsStore.Save(settings);
        lock (_gate)
            _settings = saved;
        Reload();
        return saved;
    }

    public void Reload()
    {
        BrainSettings settings;
        lock (_gate)
            settings = _settings;

        IEmbedder next = new NullEmbedder();

        if (string.Equals(settings.Embedder, BrainSettings.EmbedderProvider, StringComparison.Ordinal))
        {
            next = new ProviderEmbedderPlaceholder(settings.Provider, BrainProviderCredentials.HasApiKey());
        }
        else
        {
            var manifest = ModelManifestIO.TryRead(ModelPaths.ManifestPath);
            var bundle = manifest?.Bundles.FirstOrDefault(b =>
                string.Equals(b.Id, settings.LocalBundleId, StringComparison.OrdinalIgnoreCase));

            if (bundle is not null)
            {
                var filesReady = ModelManifestIO.BundleIsComplete(bundle);
                next = new LocalBundleEmbedder(bundle, filesReady);
            }
        }

        lock (_gate)
            _active = next;
    }

    public ValueTask<Embedding?> EmbedTextAsync(string text, CancellationToken cancellationToken = default)
    {
        IEmbedder active;
        lock (_gate)
            active = _active;
        return active.EmbedTextAsync(text, cancellationToken);
    }

    public ValueTask<Embedding?> EmbedImageAsync(string filePath, CancellationToken cancellationToken = default)
    {
        IEmbedder active;
        lock (_gate)
            active = _active;
        return active.EmbedImageAsync(filePath, cancellationToken);
    }
}