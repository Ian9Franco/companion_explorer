namespace CompanionExplorer.Core.Search;

public sealed record BrainBundleOption(
    string Id,
    string Label,
    int Dimensions,
    bool Installed);

public sealed record BrainSettingsView(
    int SchemaVersion,
    string Embedder,
    string LocalBundleId,
    BrainProviderPrefs? Provider,
    bool ProviderKeyConfigured,
    bool ProviderKeyStoredOnDisk,
    bool ProviderImplemented,
    string SettingsPath,
    IReadOnlyList<BrainBundleOption> AvailableBundles,
    IReadOnlyList<BrainProviderOption> ProviderOptions);

public sealed record BrainSettingsPatch(
    string? Embedder,
    string? LocalBundleId,
    BrainProviderPrefs? Provider,
    string? ProviderApiKey,
    bool? ClearProviderApiKey);