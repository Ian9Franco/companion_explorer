namespace CompanionExplorer.Core.Search;

/// <summary>
/// Embedder local atado a un bundle del manifest. ONNX entra después; hoy marca el modelo elegido.
/// </summary>
public sealed class LocalBundleEmbedder : IEmbedder
{
    public LocalBundleEmbedder(ModelBundleSpec bundle, bool filesReady)
    {
        ArgumentNullException.ThrowIfNull(bundle);
        Model = new EmbeddingModel(bundle.Id, bundle.Dimensions);
        IsReady = filesReady;
    }

    public EmbeddingModel Model { get; }

    public bool IsReady { get; }

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