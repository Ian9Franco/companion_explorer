namespace CompanionExplorer.Core;

public sealed record ThumbnailResult(
    byte[] Bytes,
    string ContentType,
    string ETag);

public interface IThumbnailSource
{
    Task<ThumbnailResult?> GetThumbnailAsync(
        string filePath,
        int size = 256,
        CancellationToken cancellationToken = default);
}
