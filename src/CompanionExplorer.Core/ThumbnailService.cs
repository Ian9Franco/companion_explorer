using System.Security.Cryptography;
using System.Text;
using SkiaSharp;

namespace CompanionExplorer.Core;

public sealed class ThumbnailService : IThumbnailSource
{
    private readonly string _cacheDirectory;
    private readonly SemaphoreSlim _concurrencyGate;

    public ThumbnailService(string? cacheDirectory = null, int maxConcurrency = 4)
    {
        _cacheDirectory = string.IsNullOrWhiteSpace(cacheDirectory)
            ? GetDefaultCacheDirectory()
            : Path.GetFullPath(cacheDirectory);

        Directory.CreateDirectory(_cacheDirectory);
        _concurrencyGate = new SemaphoreSlim(Math.Max(1, maxConcurrency));
    }

    public string CacheDirectory => _cacheDirectory;

    public static string GetDefaultCacheDirectory()
    {
        var baseDir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(baseDir))
            baseDir = Path.GetTempPath();

        return Path.Combine(baseDir, "CompanionExplorer", "cache", "thumbs");
    }

    public async Task<ThumbnailResult?> GetThumbnailAsync(
        string filePath,
        int size = 256,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(filePath))
            return null;

        var fullPath = FolderExplorer.NormalizePath(filePath);
        var fileInfo = new FileInfo(fullPath);
        if (!fileInfo.Exists)
            return null;

        if (!MediaTypes.TryGetKind(fileInfo.Extension, out var kind))
            return null;

        var clampedSize = Math.Clamp(size, 64, 1024);
        var cacheKey = ComputeCacheKey(fullPath, fileInfo.Length, fileInfo.LastWriteTimeUtc.Ticks, clampedSize);
        var etag = $"\"{cacheKey}\"";

        if (string.Equals(fileInfo.Extension, ".svg", StringComparison.OrdinalIgnoreCase))
        {
            var svgBytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
            return new ThumbnailResult(svgBytes, "image/svg+xml", etag);
        }

        var cacheFilePath = Path.Combine(_cacheDirectory, $"{cacheKey}.jpg");
        if (File.Exists(cacheFilePath))
        {
            try
            {
                var cachedBytes = await File.ReadAllBytesAsync(cacheFilePath, cancellationToken);
                if (cachedBytes.Length > 0)
                    return new ThumbnailResult(cachedBytes, "image/jpeg", etag);
            }
            catch
            {
                // Regenerate if cache read fails
            }
        }

        await _concurrencyGate.WaitAsync(cancellationToken);
        try
        {
            if (File.Exists(cacheFilePath))
            {
                var cachedBytes = await File.ReadAllBytesAsync(cacheFilePath, cancellationToken);
                if (cachedBytes.Length > 0)
                    return new ThumbnailResult(cachedBytes, "image/jpeg", etag);
            }

            byte[]? generated = null;

            if (OperatingSystem.IsWindows() &&
                WindowsShellThumbnailExtractor.TryExtractJpeg(fullPath, clampedSize, out var shellBytes))
            {
                generated = shellBytes;
            }
            else if (kind == MediaKind.Image)
            {
                generated = await Task.Run(() => GenerateSkiaThumbnail(fullPath, clampedSize), cancellationToken);
            }

            if (generated is null || generated.Length == 0)
                return null;

            await WriteCacheFileSafelyAsync(cacheFilePath, generated, cancellationToken);
            return new ThumbnailResult(generated, "image/jpeg", etag);
        }
        finally
        {
            _concurrencyGate.Release();
        }
    }

    private static byte[]? GenerateSkiaThumbnail(string fullPath, int maxSize)
    {
        try
        {
            using var stream = new FileStream(
                fullPath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete);

            using var codec = SKCodec.Create(stream);
            if (codec is null)
                return null;

            var srcWidth = codec.Info.Width;
            var srcHeight = codec.Info.Height;
            if (srcWidth <= 0 || srcHeight <= 0)
                return null;

            using var original = SKBitmap.Decode(codec);
            if (original is null)
                return null;

            var scale = Math.Min(1.0, (double)maxSize / Math.Max(srcWidth, srcHeight));
            var targetWidth = Math.Max(1, (int)Math.Round(srcWidth * scale));
            var targetHeight = Math.Max(1, (int)Math.Round(srcHeight * scale));

            SKBitmap bitmapToEncode = original;
            SKBitmap? resized = null;
            try
            {
                if (targetWidth != srcWidth || targetHeight != srcHeight)
                {
                    var targetInfo = new SKImageInfo(targetWidth, targetHeight, SKColorType.Bgra8888, SKAlphaType.Premul);
                    resized = original.Resize(targetInfo, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
                    if (resized is not null)
                        bitmapToEncode = resized;
                }

                using var srcImage = SKImage.FromBitmap(bitmapToEncode);
                using var surface = SKSurface.Create(new SKImageInfo(bitmapToEncode.Width, bitmapToEncode.Height, SKColorType.Bgra8888, SKAlphaType.Opaque));
                if (surface is not null)
                {
                    surface.Canvas.Clear(new SKColor(17, 17, 17));
                    surface.Canvas.DrawImage(srcImage, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.None));
                    using var flattened = surface.Snapshot();
                    using var encodedFlat = flattened.Encode(SKEncodedImageFormat.Jpeg, 82);
                    return encodedFlat?.ToArray();
                }

                using var encoded = srcImage.Encode(SKEncodedImageFormat.Jpeg, 82);
                return encoded?.ToArray();
            }
            finally
            {
                resized?.Dispose();
            }
        }
        catch
        {
            return null;
        }
    }

    private static async Task WriteCacheFileSafelyAsync(
        string cacheFilePath,
        byte[] bytes,
        CancellationToken cancellationToken)
    {
        try
        {
            var tempPath = $"{cacheFilePath}.{Guid.NewGuid():N}.tmp";
            await File.WriteAllBytesAsync(tempPath, bytes, cancellationToken);
            File.Move(tempPath, cacheFilePath, overwrite: true);
        }
        catch
        {
            // Caching is best-effort
        }
    }

    private static string ComputeCacheKey(string fullPath, long length, long lastWriteUtcTicks, int size)
    {
        var input = $"{fullPath}|{length}|{lastWriteUtcTicks}|{size}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash)[..32].ToLowerInvariant();
    }
}
