using CompanionExplorer.Core;
using SkiaSharp;

namespace CompanionExplorer.Core.Tests;

public class ThumbnailServiceTests
{
    [Fact]
    public async Task Genera_miniatura_achicada_y_la_cachea_fuera_de_la_carpeta_del_usuario()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "companion-thumb-" + Guid.NewGuid().ToString("N"));
        var userFolder = Path.Combine(tempRoot, "fotos");
        var cacheFolder = Path.Combine(tempRoot, "cache");
        Directory.CreateDirectory(userFolder);

        try
        {
            var photoPath = Path.Combine(userFolder, "paisaje.png");
            CreateSamplePng(photoPath, width: 1200, height: 800);

            var service = new ThumbnailService(cacheFolder);
            var result = await service.GetThumbnailAsync(photoPath, size: 256);

            Assert.NotNull(result);
            Assert.Equal("image/jpeg", result.ContentType);
            Assert.NotEmpty(result.Bytes);
            Assert.StartsWith("\"", result.ETag);

            using var decoded = SKBitmap.Decode(result.Bytes);
            Assert.NotNull(decoded);
            Assert.Equal(256, decoded.Width);
            Assert.Equal(171, decoded.Height);

            // Zero-Touch: la carpeta del usuario sigue teniendo únicamente la foto original
            var userEntries = Directory.GetFileSystemEntries(userFolder);
            Assert.Single(userEntries);
            Assert.Equal(photoPath, userEntries[0]);

            // La caché externa sí guardó la miniatura generada
            Assert.NotEmpty(Directory.GetFiles(cacheFolder, "*.jpg"));
        }
        finally
        {
            if (Directory.Exists(tempRoot))
                Directory.Delete(tempRoot, recursive: true);
        }
    }

    private static void CreateSamplePng(string path, int width, int height)
    {
        using var bitmap = new SKBitmap(width, height, SKColorType.Bgra8888, SKAlphaType.Opaque);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(new SKColor(40, 90, 160));
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 90);
        using var stream = File.OpenWrite(path);
        data.SaveTo(stream);
    }
}
