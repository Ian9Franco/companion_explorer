using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Core.Tests;

public class BrainSecretStoreTests
{
    [Fact]
    public void Guarda_y_lee_api_key_cifrada()
    {
        var dir = Path.Combine(Path.GetTempPath(), "companion-secret-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var store = new BrainSecretStore(dir);

        store.SaveApiKey("sk-test-123");
        Assert.True(store.HasApiKey());
        Assert.True(store.TryReadApiKey(out var key));
        Assert.Equal("sk-test-123", key);

        store.ClearApiKey();
        Assert.False(store.HasApiKey());
    }
}