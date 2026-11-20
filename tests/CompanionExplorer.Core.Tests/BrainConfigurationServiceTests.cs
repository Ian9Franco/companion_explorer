using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Core.Tests;

public class BrainConfigurationServiceTests
{
    private static BrainConfigurationService CreateService(out string dataDir)
    {
        dataDir = Path.Combine(Path.GetTempPath(), "companion-brain-cfg-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dataDir);
        var store = new BrainSettingsStore(dataDir);
        var secrets = new BrainSecretStore(dataDir);
        var credentials = new BrainCredentialResolver(secrets);
        var registry = new EmbedderRegistry(store, credentials);
        return new BrainConfigurationService(store, registry, new ModelInstaller(), secrets, credentials);
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
    public async Task Puede_guardar_proveedor_y_api_key_sin_devolverla()
    {
        var service = CreateService(out var dataDir);
        var view = await service.ApplyPatchAsync(
            new BrainSettingsPatch(
                Embedder: BrainSettings.EmbedderProvider,
                LocalBundleId: "companion-brain-v1",
                Provider: new BrainProviderPrefs("openai", "text-embedding-3-small"),
                ProviderApiKey: "sk-local-test",
                ClearProviderApiKey: null),
            CancellationToken.None);

        Assert.Equal(BrainSettings.EmbedderProvider, view.Embedder);
        Assert.True(view.ProviderKeyConfigured);
        Assert.True(view.ProviderKeyStoredOnDisk);
        Assert.True(File.Exists(Path.Combine(dataDir, "brain.settings.json")));
        Assert.True(File.Exists(Path.Combine(dataDir, "brain.provider.key")));
        Assert.False(view.ProviderImplemented);
    }
}