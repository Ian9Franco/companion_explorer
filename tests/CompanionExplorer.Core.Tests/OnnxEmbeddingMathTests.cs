using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Core.Tests;

public class OnnxEmbeddingMathTests
{
    [Fact]
    public void Normaliza_vectores_a_longitud_uno()
    {
        var vector = OnnxEmbeddingMath.ToVectorAndNormalize([3f, 4f], 2);
        var length = Math.Sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
        Assert.InRange(length, 0.999f, 1.001f);
    }
}