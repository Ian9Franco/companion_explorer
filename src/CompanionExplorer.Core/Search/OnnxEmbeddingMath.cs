namespace CompanionExplorer.Core.Search;

public static class OnnxEmbeddingMath
{
    public static float[] ToVectorAndNormalize(ReadOnlySpan<float> values, int dimensions)
    {
        if (values.Length < dimensions)
            throw new InvalidOperationException($"El tensor devolvió {values.Length} valores; se esperaban {dimensions}.");

        var slice = values.Length == dimensions ? values : values[..dimensions];
        var copy = slice.ToArray();
        NormalizeInPlace(copy);
        return copy;
    }

    public static void NormalizeInPlace(Span<float> vector)
    {
        double sum = 0;
        foreach (var v in vector)
            sum += v * v;

        if (sum <= 1e-12)
            return;

        var inv = (float)(1.0 / Math.Sqrt(sum));
        for (var i = 0; i < vector.Length; i++)
            vector[i] *= inv;
    }
}