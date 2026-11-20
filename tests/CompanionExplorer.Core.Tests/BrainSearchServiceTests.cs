using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Core.Tests;

public class BrainSearchServiceTests
{
    private static BrainSearchService CreateBrainSearchService()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "companion-brain-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dataDir);
        var store = new BrainSettingsStore(dataDir);
        var secrets = new BrainSecretStore(dataDir);
        var credentials = new BrainCredentialResolver(secrets);
        var registry = new EmbedderRegistry(store, credentials);
        return new BrainSearchService(registry, new ModelInstaller());
    }
    [Fact]
    public void Estado_inicial_sin_indice_ni_embedder()
    {
        var service = CreateBrainSearchService();
        var status = service.GetStatus();

        Assert.Equal("foundation", status.Phase);
        Assert.False(status.IndexReady);
        Assert.False(status.EmbedderReady);
        Assert.Equal("companion-brain-v1", status.ModelId);
        Assert.Equal(0, status.IndexedVectors);
        Assert.NotEmpty(status.Message);
    }

    [Fact]
    public async Task Busqueda_devuelve_lista_vacia_y_mensaje()
    {
        var service = CreateBrainSearchService();
        var response = await service.SearchAsync("atardecer en la playa", 24, CancellationToken.None);

        Assert.Equal("atardecer en la playa", response.Query);
        Assert.Empty(response.Results);
        Assert.False(response.IndexReady);
        Assert.Contains("índice", response.Message, StringComparison.OrdinalIgnoreCase);
    }
}