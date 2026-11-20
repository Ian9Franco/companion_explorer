using System.Net.Http;
using System.Security.Cryptography;

namespace CompanionExplorer.Core.Search;

/// <summary>
/// Deja el modelo por defecto en <see cref="ModelPaths.ModelsDirectory"/>.
/// La descarga la hace Companion; el usuario no elige carpetas sueltas en el disco.
/// </summary>
public sealed class ModelInstaller
{
    private readonly object _gate = new();
    private ModelInstallStatus _status;

    public ModelInstaller()
    {
        _status = BuildStatus(ModelInstallPhase.NotConfigured, null, "Sin manifest de modelos.");
    }

    public ModelInstallStatus CurrentStatus
    {
        get
        {
            lock (_gate)
                return _status;
        }
    }

    public async Task<ModelInstallStatus> EnsureDefaultBundleAsync(CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            if (_status.Phase is ModelInstallPhase.Ready or ModelInstallPhase.Downloading)
                return _status;
        }

        var manifest = ModelManifestIO.TryRead(ModelPaths.ManifestPath);
        if (manifest is null || string.IsNullOrWhiteSpace(manifest.DefaultModelId))
        {
            var missing = BuildStatus(
                ModelInstallPhase.NotConfigured,
                null,
                $"No hay manifest en {ModelPaths.ManifestPath}. El release debe incluir models/manifest.json.");
            SetStatus(missing);
            return missing;
        }

        var bundle = manifest.Bundles.FirstOrDefault(b =>
            string.Equals(b.Id, manifest.DefaultModelId, StringComparison.OrdinalIgnoreCase));
        if (bundle is null)
        {
            var bad = BuildStatus(
                ModelInstallPhase.NotConfigured,
                manifest.DefaultModelId,
                $"El manifest no define el bundle «{manifest.DefaultModelId}».");
            SetStatus(bad);
            return bad;
        }

        if (ModelManifestIO.BundleIsComplete(bundle))
        {
            var ready = BuildStatus(
                ModelInstallPhase.Ready,
                bundle.Id,
                "Modelo local listo (junto a la instalación).");
            SetStatus(ready);
            return ready;
        }

        var filesNeedingDownload = bundle.Files.Where(f => !File.Exists(Path.Combine(ModelPaths.BundleDirectory(bundle.Id), f.Name))).ToList();
        var downloadable = filesNeedingDownload.Where(f => !string.IsNullOrWhiteSpace(f.Url)).ToList();

        if (downloadable.Count < filesNeedingDownload.Count)
        {
            var missing = BuildStatus(
                ModelInstallPhase.Missing,
                bundle.Id,
                "Faltan archivos ONNX. El build de release debe prefetch o completar las URLs en manifest.json.");
            SetStatus(missing);
            return missing;
        }

        SetStatus(BuildStatus(ModelInstallPhase.Downloading, bundle.Id, "Descargando modelo visual…"));

        Directory.CreateDirectory(ModelPaths.BundleDirectory(bundle.Id));

        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
        foreach (var file in downloadable)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var target = Path.Combine(ModelPaths.BundleDirectory(bundle.Id), file.Name);
            var temp = target + ".download";

            await using (var stream = await http.GetStreamAsync(file.Url!, cancellationToken))
            await using (var fileStream = File.Create(temp))
            {
                await stream.CopyToAsync(fileStream, cancellationToken);
            }

            if (!string.IsNullOrWhiteSpace(file.Sha256) &&
                !string.Equals(ComputeSha256Hex(temp), file.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                File.Delete(temp);
                var corrupt = BuildStatus(
                    ModelInstallPhase.Missing,
                    bundle.Id,
                    $"Checksum inválido en {file.Name}.");
                SetStatus(corrupt);
                return corrupt;
            }

            if (File.Exists(target))
                File.Delete(target);
            File.Move(temp, target);
        }

        if (!ModelManifestIO.BundleIsComplete(bundle))
        {
            var partial = BuildStatus(ModelInstallPhase.Missing, bundle.Id, "La descarga no completó todos los archivos.");
            SetStatus(partial);
            return partial;
        }

        var done = BuildStatus(ModelInstallPhase.Ready, bundle.Id, "Modelo local listo (junto a la instalación).");
        SetStatus(done);
        return done;
    }

    private static ModelInstallStatus BuildStatus(ModelInstallPhase phase, string? bundleId, string message) =>
        new(
            ModelsDirectory: ModelPaths.ModelsDirectory,
            DefaultModelId: bundleId,
            Phase: phase,
            ActiveBundleId: bundleId,
            Message: message);

    private void SetStatus(ModelInstallStatus status)
    {
        lock (_gate)
            _status = status;
    }

    private static string ComputeSha256Hex(string filePath)
    {
        using var sha = SHA256.Create();
        using var stream = File.OpenRead(filePath);
        return Convert.ToHexString(sha.ComputeHash(stream));
    }
}