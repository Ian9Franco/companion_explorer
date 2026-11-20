namespace CompanionExplorer.Core.Search;

/// <summary>
/// Convierte texto o una imagen en disco a un <see cref="Embedding"/>.
/// La implementación real será ONNX/DirectML; mientras tanto hay un stub.
/// </summary>
public interface IEmbedder
{
    EmbeddingModel Model { get; }

    /// <summary>El modelo está cargado y puede producir vectores.</summary>
    bool IsReady { get; }

    ValueTask<Embedding?> EmbedTextAsync(string text, CancellationToken cancellationToken = default);

    ValueTask<Embedding?> EmbedImageAsync(string filePath, CancellationToken cancellationToken = default);
}