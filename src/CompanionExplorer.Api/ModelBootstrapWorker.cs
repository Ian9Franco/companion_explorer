using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Api;

/// <summary>
/// Al arrancar el núcleo, prepara el bundle ONNX por defecto (descarga o verifica archivos locales).
/// </summary>
public sealed class ModelBootstrapWorker : BackgroundService
{
    private readonly ModelInstaller _installer;
    private readonly ILogger<ModelBootstrapWorker> _logger;

    public ModelBootstrapWorker(ModelInstaller installer, ILogger<ModelBootstrapWorker> logger)
    {
        _installer = installer;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            var status = await _installer.EnsureDefaultBundleAsync(stoppingToken);
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