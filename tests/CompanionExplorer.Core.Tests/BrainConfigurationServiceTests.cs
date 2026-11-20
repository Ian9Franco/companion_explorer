using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Core.Tests;

public class BrainConfigurationServiceTests
{
    private static BrainConfigurationService CreateService(out string dataDir)
    {
        dataDir = Path.Combine(Path.GetTempPath(), "companion-brain-cfg-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dataDir);
        var store = new BrainSettingsStore(dataDir);
        var registry = new EmbedderRegistry(store);
        return new BrainConfigurationService(store, registry, new ModelInstaller());
    }

    [Fact]
    public void La_vista_lista_bundles_y_proveedores_sin_implementar()
    {
        var service = CreateService(out _);
        var view = service.GetView();

        Assert.Equal(BrainSettings.EmbedderLocal, view.Embedder);
        Assert.NotEmpty(view.AvailableBundles);
        Assert.Contains(view.ProviderOptions, p => p.Id == "openai" && !p.Implemented);
        Assert.False(view.ProviderKeyConfigured);
    }

    [Fact]
    public async Task Puede_guardar_proveedor_sin_key_ni_implementacion()
    {
        var service = CreateService(out var dataDir);
        var view = await service.ApplyPatchAsync(
            new BrainSettingsPatch(
                Embedder: BrainSettings.EmbedderProvider,
                LocalBundleId: "companion-brain-v1",
                Provider: new BrainProviderPrefs("openai", "text-embedding-3-small")),
            CancellationToken.None);

        Assert.Equal(BrainSettings.EmbedderProvider, view.Embedder);
        Assert.Equal("openai", view.Provider?.ProviderId);
        Assert.True(File.Exists(Path.Combine(dataDir, "brain.settings.json")));
        Assert.False(view.ProviderImplemented);
    }
}