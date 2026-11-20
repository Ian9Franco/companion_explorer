using System.Security.Cryptography;
using System.Text;

namespace CompanionExplorer.Core.Search;

/// <summary>
/// API key del proveedor cifrada con DPAPI (usuario de Windows). Vive en el directorio de datos.
/// </summary>
public sealed class BrainSecretStore
{
    private readonly string _apiKeyPath;

    public BrainSecretStore(string dataDirectory)
    {
        if (string.IsNullOrWhiteSpace(dataDirectory))
            throw new ArgumentException("El directorio de datos es obligatorio.", nameof(dataDirectory));

        _apiKeyPath = Path.Combine(dataDirectory, "brain.provider.key");
    }

    public bool HasApiKey() => TryReadApiKey(out var key) && !string.IsNullOrWhiteSpace(key);

    public bool TryReadApiKey(out string? apiKey)
    {
        apiKey = null;
        if (!File.Exists(_apiKeyPath))
            return false;

        try
        {
            var protectedBytes = File.ReadAllBytes(_apiKeyPath);
            var plain = ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, DataProtectionScope.CurrentUser);
            apiKey = Encoding.UTF8.GetString(plain);
            return !string.IsNullOrWhiteSpace(apiKey);
        }
        catch
        {
            return false;
        }
    }

    public void SaveApiKey(string apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new ArgumentException("La API key no puede estar vacía.", nameof(apiKey));

        var plain = Encoding.UTF8.GetBytes(apiKey.Trim());
        var protectedBytes = ProtectedData.Protect(plain, optionalEntropy: null, DataProtectionScope.CurrentUser);
        Directory.CreateDirectory(Path.GetDirectoryName(_apiKeyPath)!);
        File.WriteAllBytes(_apiKeyPath, protectedBytes);
    }

    public void ClearApiKey()
    {
        if (File.Exists(_apiKeyPath))
            File.Delete(_apiKeyPath);
    }
}