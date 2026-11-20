namespace CompanionExplorer.Core.Search;

/// <summary>
/// Base para embedders remotos. Hoy no llama a ningún proveedor; valida prefs y si hay API key.
/// </summary>
public sealed class ProviderEmbedderPlaceholder : IEmbedder
{
    private static readonly EmbeddingModel PlaceholderModel = new("provider.pending", 1);

    public ProviderEmbedderPlaceholder(BrainProviderPrefs? provider, bool apiKeyPresent)
    {
        Provider = provider;
        ApiKeyPresent = apiKeyPresent;
        Model = provider is null || string.IsNullOrWhiteSpace(provider.ModelId)
            ? PlaceholderModel
            : new EmbeddingModel($"{provider.ProviderId}:{provider.ModelId}", 1);
    }

    public BrainProviderPrefs? Provider { get; }

    public bool ApiKeyPresent { get; }

    public EmbeddingModel Model { get; }

    public bool IsReady => false;

    public ValueTask<Embedding?> EmbedTextAsync(string text, CancellationToken cancellationToken = default)
    {
        _ = text;
        cancellationToken.ThrowIfCancellationRequested();
        return ValueTask.FromResult<Embedding?>(null);
    }

    public ValueTask<Embedding?> EmbedImageAsync(string filePath, CancellationToken cancellationToken = default)
    {
        _ = filePath;
        cancellationToken.ThrowIfCancellationRequested();
        return ValueTask.FromResult<Embedding?>(null);
    }
}