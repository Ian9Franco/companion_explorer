using CompanionExplorer.Core;

namespace CompanionExplorer.Core.Tests;

public class BrandStoreTests
{
    [Fact]
    public void La_marca_por_defecto_es_companion()
    {
        using var root = new TempRepo();
        var store = BrandStore.Load(root.Path);

        Assert.Equal("companion", store.Current.Id);
        Assert.Equal("Companion Explorer", store.Current.ProductName);
        Assert.True(File.Exists(store.LogoPath));
    }

    [Fact]
    public void Fanger_solo_cambia_la_marca()
    {
        using var root = new TempRepo();
        var store = BrandStore.Load(root.Path, "fanger");

        Assert.Equal("fanger", store.Current.Id);
        Assert.Equal("Fanger", store.Current.PreloadTitle);
        Assert.NotEqual("Companion Explorer", store.Current.ProductName);
    }

    [Fact]
    public void Una_marca_desconocida_falla()
    {
        using var root = new TempRepo();
        var error = Assert.Throws<ArgumentException>(() => BrandStore.Load(root.Path, "otro"));
        Assert.Contains("otro", error.Message);
    }

    private sealed class TempRepo : IDisposable
    {
        public TempRepo()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "companion-" + Guid.NewGuid().ToString("N"));
            Write("companion", "Companion Explorer", "Companion");
            Write("fanger", "Fanger Scan", "Fanger");
        }

        public string Path { get; }

        public void Dispose() => Directory.Delete(Path, recursive: true);

        private void Write(string id, string productName, string preload)
        {
            var dir = System.IO.Path.Combine(Path, "brands", id);
            Directory.CreateDirectory(dir);
            var json = $$"""
                {
                  "id": "{{id}}",
                  "productName": "{{productName}}",
                  "windowTitle": "{{productName}}",
                  "preloadTitle": "{{preload}}"
                }
                """;
            File.WriteAllText(System.IO.Path.Combine(dir, "brand.json"), json);
            File.WriteAllText(System.IO.Path.Combine(dir, "logo.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
        }
    }
}
