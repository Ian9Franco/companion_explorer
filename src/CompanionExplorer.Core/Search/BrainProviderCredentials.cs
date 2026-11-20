namespace CompanionExplorer.Core.Search;

public static class BrainProviderCredentials
{
    public const string ApiKeyVariable = "COMPANION_BRAIN_PROVIDER_API_KEY";
    public const string EndpointVariable = "COMPANION_BRAIN_PROVIDER_ENDPOINT";

    public static bool HasApiKey() =>
        !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(ApiKeyVariable));

    public static string? EndpointOrNull() =>
        Environment.GetEnvironmentVariable(EndpointVariable);
}