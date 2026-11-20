using System.Text.Json;
using System.Text.Json.Serialization;

namespace CompanionExplorer.Core.Search;

public sealed record ModelFileSpec(
    string Name,
    string? Url,
    string? Sha256);

public sealed record ModelBundleSpec(
    string Id,
    string Label,
    int Dimensions,
    IReadOnlyList<ModelFileSpec> Files);

public sealed record ModelManifest(
    string DefaultModelId,
    IReadOnlyList<ModelBundleSpec> Bundles);

public static class ModelManifestIO
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    public static ModelManifest? TryRead(string manifestPath)
    {
        if (!File.Exists(manifestPath))
            return null;

        try
        {
            var json = File.ReadAllText(manifestPath);
            return JsonSerializer.Deserialize<ModelManifest>(json, JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    public static bool BundleIsComplete(ModelBundleSpec bundle)
    {
        var dir = ModelPaths.BundleDirectory(bundle.Id);
        if (!Directory.Exists(dir))
            return false;

        foreach (var file in bundle.Files)
        {
            var path = Path.Combine(dir, file.Name);
            if (!File.Exists(path))
                return false;
        }

        return bundle.Files.Count > 0;
    }
}