namespace CompanionExplorer.Core.Search;

/// <summary>
/// Resuelve credenciales: primero variable de entorno (override), luego almacén cifrado local.
/// </summary>
public sealed class BrainCredentialResolver
{
    private readonly BrainSecretStore _secrets;

    public BrainCredentialResolver(BrainSecretStore secrets)
    {
        _secrets = secrets;
    }

    public bool HasApiKey()
    {
        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(BrainProviderCredentials.ApiKeyVariable)))
            return true;
        return _secrets.HasApiKey();
    }

    public string? GetApiKey()
    {
        var fromEnv = Environment.GetEnvironmentVariable(BrainProviderCredentials.ApiKeyVariable);
        if (!string.IsNullOrWhiteSpace(fromEnv))
            return fromEnv.Trim();

        return _secrets.TryReadApiKey(out var key) ? key : null;
    }

    public string? EndpointOrNull() =>
        Environment.GetEnvironmentVariable(BrainProviderCredentials.EndpointVariable);

    public bool KeyStoredOnDisk => _secrets.HasApiKey();
}