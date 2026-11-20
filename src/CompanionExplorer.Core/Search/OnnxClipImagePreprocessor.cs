using Microsoft.ML.OnnxRuntime.Tensors;
using SkiaSharp;

namespace CompanionExplorer.Core.Search;

internal static class OnnxClipImagePreprocessor
{
    private static readonly float[] Mean = [0.48145466f, 0.4578275f, 0.40821073f];
    private static readonly float[] Std = [0.26862954f, 0.26130258f, 0.27577711f];

    public const int DefaultSize = 224;

    public static DenseTensor<float> BuildPixelTensor(string filePath, int size = DefaultSize)
    {
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            throw new FileNotFoundException("No se encontró la imagen.", filePath);

        using var codec = SKCodec.Create(filePath);
        if (codec is null)
            throw new InvalidOperationException($"No se pudo decodificar «{filePath}».");

        using var original = SKBitmap.Decode(codec);
        if (original is null)
            throw new InvalidOperationException($"No se pudo leer la imagen «{filePath}».");

        using var working = ResizeCover(original, size);
        return PixelsToTensor(working, size);
    }

    private static SKBitmap ResizeCover(SKBitmap source, int size)
    {
        var scale = Math.Max((float)size / source.Width, (float)size / source.Height);
        var scaledW = (int)Math.Round(source.Width * scale);
        var scaledH = (int)Math.Round(source.Height * scale);

        var scaled = new SKBitmap(scaledW, scaledH, SKColorType.Rgba8888, SKAlphaType.Opaque);
        using (var canvas = new SKCanvas(scaled))
        {
            canvas.Clear(SKColors.Black);
            canvas.DrawBitmap(source, new SKRect(0, 0, scaledW, scaledH), SKSamplingOptions.Default);
        }

        var left = Math.Max(0, (scaledW - size) / 2);
        var top = Math.Max(0, (scaledH - size) / 2);
        var crop = new SKBitmap(size, size, SKColorType.Rgba8888, SKAlphaType.Opaque);
        using var canvas = new SKCanvas(crop);
        canvas.DrawBitmap(scaled, new SKRect(-left, -top, scaledW - left, scaledH - top));

        if (!ReferenceEquals(scaled, source))
            scaled.Dispose();

        return crop;
    }

    private static DenseTensor<float> PixelsToTensor(SKBitmap bitmap, int size)
    {
        var tensor = new DenseTensor<float>([1, 3, size, size]);
        for (var y = 0; y < size; y++)
        {
            for (var x = 0; x < size; x++)
            {
                var color = bitmap.GetPixel(x, y);
                var r = color.Red / 255f;
                var g = color.Green / 255f;
                var b = color.Blue / 255f;
                tensor[0, 0, y, x] = (r - Mean[0]) / Std[0];
                tensor[0, 1, y, x] = (g - Mean[1]) / Std[1];
                tensor[0, 2, y, x] = (b - Mean[2]) / Std[2];
            }
        }

        return tensor;
    }
}