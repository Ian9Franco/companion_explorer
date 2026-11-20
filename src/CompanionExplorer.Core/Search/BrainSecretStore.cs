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
            var plain = Unprotect(protectedBytes);
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
        var protectedBytes = Protect(plain);
        Directory.CreateDirectory(Path.GetDirectoryName(_apiKeyPath)!);
        File.WriteAllBytes(_apiKeyPath, protectedBytes);
    }

    private byte[] Protect(byte[] plain)
    {
        if (OperatingSystem.IsWindows())
            return ProtectedData.Protect(plain, optionalEntropy: null, DataProtectionScope.CurrentUser);

        return AesSeal(plain);
    }

    private byte[] Unprotect(byte[] payload)
    {
        if (OperatingSystem.IsWindows())
            return ProtectedData.Unprotect(payload, optionalEntropy: null, DataProtectionScope.CurrentUser);

        return AesOpen(payload);
    }

    private string AesKeyPath => _apiKeyPath + ".aes";

    private byte[] AesSeal(byte[] plain)
    {
        var key = LoadOrCreateAesKey();
        var nonce = RandomNumberGenerator.GetBytes(12);
        var cipher = new byte[plain.Length];
        var tag = new byte[16];
        using var aes = new AesGcm(key, 16);
        aes.Encrypt(nonce, plain, cipher, tag);
        var packed = new byte[1 + nonce.Length + tag.Length + cipher.Length];
        packed[0] = 2;
        nonce.CopyTo(packed, 1);
        tag.CopyTo(packed, 1 + nonce.Length);
        cipher.CopyTo(packed, 1 + nonce.Length + tag.Length);
        return packed;
    }

    private byte[] AesOpen(byte[] payload)
    {
        if (payload.Length < 1 + 12 + 16 || payload[0] != 2)
            throw new CryptographicException("Formato de clave no reconocido.");

        var key = File.ReadAllBytes(AesKeyPath);
        var nonce = payload.AsSpan(1, 12);
        var tag = payload.AsSpan(13, 16);
        var cipher = payload.AsSpan(29);
        var plain = new byte[cipher.Length];
        using var aes = new AesGcm(key, 16);
        aes.Decrypt(nonce, cipher, tag, plain);
        return plain;
    }

    private byte[] LoadOrCreateAesKey()
    {
        if (File.Exists(AesKeyPath))
            return File.ReadAllBytes(AesKeyPath);

        var key = RandomNumberGenerator.GetBytes(32);
        Directory.CreateDirectory(Path.GetDirectoryName(AesKeyPath)!);
        File.WriteAllBytes(AesKeyPath, key);
        return key;
    }

    public void ClearApiKey()
    {
        if (File.Exists(_apiKeyPath))
            File.Delete(_apiKeyPath);
    }
}