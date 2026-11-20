namespace CompanionExplorer.Core.Search;

/// <summary>
/// Proveedores que el usuario puede cablear con su propia cuenta. Companion no incluye keys ni SDKs.
/// </summary>
public sealed record BrainProviderOption(
    string Id,
    string Label,
    bool Implemented,
    string SetupHint);

public static class BrainProviderCatalog
{
    public static IReadOnlyList<BrainProviderOption> All { get; } =
    [
        new("openai", "OpenAI Embeddings", false,
            "Variable COMPANION_BRAIN_PROVIDER_API_KEY con tu API key."),
        new("azure-openai", "Azure OpenAI", false,
            "Variables COMPANION_BRAIN_PROVIDER_API_KEY y COMPANION_BRAIN_PROVIDER_ENDPOINT."),
    ];

    public static bool IsKnown(string providerId) =>
        All.Any(p => string.Equals(p.Id, providerId, StringComparison.OrdinalIgnoreCase));

    public static BrainProviderOption? Find(string providerId) =>
        All.FirstOrDefault(p => string.Equals(p.Id, providerId, StringComparison.OrdinalIgnoreCase));
}