using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Core.Tests;

public class BrainSearchServiceTests
{
    [Fact]
    public void Estado_inicial_sin_indice_ni_embedder()
    {
        var service = new BrainSearchService(new NullEmbedder(), new ModelInstaller());
        var status = service.GetStatus();

        Assert.Equal("foundation", status.Phase);
        Assert.False(status.IndexReady);
        Assert.False(status.EmbedderReady);
        Assert.Equal(NullEmbedder.PlaceholderModel.Id, status.ModelId);
        Assert.Equal(0, status.IndexedVectors);
        Assert.NotEmpty(status.Message);
    }

    [Fact]
    public async Task Busqueda_devuelve_lista_vacia_y_mensaje()
    {
        var service = new BrainSearchService(new NullEmbedder(), new ModelInstaller());
        var response = await service.SearchAsync("atardecer en la playa", 24, CancellationToken.None);

        Assert.Equal("atardecer en la playa", response.Query);
        Assert.Empty(response.Results);
        Assert.False(response.IndexReady);
        Assert.Contains("índice", response.Message, StringComparison.OrdinalIgnoreCase);
    }
}