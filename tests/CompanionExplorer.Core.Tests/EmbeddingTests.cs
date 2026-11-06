using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Core.Tests;

public class EmbeddingTests
{
    [Fact]
    public void El_modelo_guarda_el_id_recortado_y_sus_dimensiones()
    {
        var model = new EmbeddingModel("  siglip-so400m  ", 4);

        Assert.Equal("siglip-so400m", model.Id);
        Assert.Equal(4, model.Dimensions);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Un_modelo_sin_id_no_existe(string? id)
    {
        var error = Assert.Throws<ArgumentException>(() => new EmbeddingModel(id!, 4));
        Assert.Contains("id", error.Message);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Un_modelo_sin_dimensiones_no_existe(int dimensions)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new EmbeddingModel("siglip", dimensions));
    }

    [Fact]
    public void El_mismo_id_con_otras_dimensiones_es_otro_modelo()
    {
        var chico = new EmbeddingModel("siglip", 2);
        var grande = new EmbeddingModel("siglip", 4);

        Assert.NotEqual(chico, grande);
    }

    [Fact]
    public void El_vector_se_copia_y_conserva_el_modelo()
    {
        var model = new EmbeddingModel("siglip", 3);
        var source = new float[] { 0.1f, -2f, 0.5f };

        var embedding = new Embedding(model, source);
        source[0] = 99f;

        Assert.Same(model, embedding.Model);
        Assert.Equal(new[] { 0.1f, -2f, 0.5f }, embedding.Values.ToArray());
    }

    [Fact]
    public void Una_longitud_distinta_a_la_del_modelo_falla()
    {
        var model = new EmbeddingModel("siglip", 3);

        var error = Assert.Throws<ArgumentException>(() => new Embedding(model, [1f, 2f]));
        Assert.Contains("3", error.Message);
        Assert.Contains("2", error.Message);
    }

    [Theory]
    [InlineData(float.NaN)]
    [InlineData(float.PositiveInfinity)]
    [InlineData(float.NegativeInfinity)]
    public void Un_numero_no_finito_falla(float value)
    {
        var model = new EmbeddingModel("siglip", 2);

        var error = Assert.Throws<ArgumentException>(() => new Embedding(model, [value, 1f]));
        Assert.Contains("finitos", error.Message);
    }
}
