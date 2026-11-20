namespace CompanionExplorer.Core.Search;

/// <summary>
/// Placeholder hasta montar ONNX. Expone el contrato sin calcular vectores reales.
/// </summary>
public sealed class NullEmbedder : IEmbedder
{
    public static readonly EmbeddingModel PlaceholderModel = new("companion.none", 512);

    public EmbeddingModel Model => PlaceholderModel;

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