using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Api;

/// <summary>
/// Al arrancar el núcleo, prepara el bundle ONNX por defecto (descarga o verifica archivos locales).
/// </summary>
public sealed class ModelBootstrapWorker : BackgroundService
{
    private readonly ModelInstaller _installer;
    private readonly EmbedderRegistry _registry;
    private readonly ILogger<ModelBootstrapWorker> _logger;

    public ModelBootstrapWorker(ModelInstaller installer, EmbedderRegistry registry, ILogger<ModelBootstrapWorker> logger)
    {
        _installer = installer;
        _registry = registry;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            var settings = _registry.CurrentSettings;
            var status = string.Equals(settings.Embedder, BrainSettings.EmbedderLocal, StringComparison.Ordinal)
                ? await _installer.EnsureBundleAsync(settings.LocalBundleId, stoppingToken)
                : await _installer.EnsureDefaultBundleAsync(stoppingToken);
            _registry.Reload();
            _logger.LogInformation(
                "Modelos visuales: {Phase} en {Directory} — {Message}",
                status.Phase,
                status.ModelsDirectory,
                status.Message);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // shutdown
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo preparar el bundle de modelos al inicio.");
        }
    }
}