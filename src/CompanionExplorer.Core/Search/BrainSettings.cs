namespace CompanionExplorer.Core.Search;

/// <summary>
/// Preferencias de búsqueda visual por usuario (en el directorio de datos).
/// Por defecto local; el modo proveedor guarda preferencias, la key va en variables de entorno.
/// </summary>
public sealed record BrainProviderPrefs(
    string ProviderId,
    string ModelId);

public sealed record BrainSettings(
    int SchemaVersion,
    string Embedder,
    string LocalBundleId,
    BrainProviderPrefs? Provider)
{
    public const int CurrentSchemaVersion = 2;
    public const string EmbedderLocal = "local";
    public const string EmbedderProvider = "provider";

    public static BrainSettings Local(string localBundleId) =>
        new(CurrentSchemaVersion, EmbedderLocal, localBundleId.Trim(), null);

    public static BrainSettings WithProvider(BrainProviderPrefs provider, string fallbackLocalBundleId) =>
        new(
            CurrentSchemaVersion,
            EmbedderProvider,
            fallbackLocalBundleId.Trim(),
            new BrainProviderPrefs(provider.ProviderId.Trim(), provider.ModelId.Trim()));
}