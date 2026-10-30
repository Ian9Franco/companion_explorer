using System.Text.Json;

namespace CompanionExplorer.Core;

public sealed class BrandStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public BrandStore(string repoRoot, string? brandId)
    {
        var id = string.IsNullOrWhiteSpace(brandId) ? "companion" : brandId.Trim().ToLowerInvariant();
        var dir = Path.Combine(repoRoot, "brands", id);
        var manifest = Path.Combine(dir, "brand.json");
        if (!File.Exists(manifest))
            throw new ArgumentException($"No existe la marca '{id}' en brands/{id}/brand.json.", nameof(brandId));

        var json = File.ReadAllText(manifest);
        var brand = JsonSerializer.Deserialize<Brand>(json, JsonOptions)
            ?? throw new InvalidOperationException($"brands/{id}/brand.json está vacío.");
        if (!string.Equals(brand.Id, id, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"brands/{id}/brand.json declara id '{brand.Id}'.");

        Current = brand;
        LogoPath = Path.Combine(dir, "logo.svg");
    }

    public Brand Current { get; }

    public string LogoPath { get; }

    public static BrandStore Load(string startDirectory, string? brandId = null)
    {
        return new BrandStore(RepoRoot.Find(startDirectory), brandId);
    }
}
