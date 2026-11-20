namespace CompanionExplorer.Core.Search;

public enum ModelInstallPhase
{
  /// <summary>El manifest no está o el bundle por defecto no está definido.</summary>
    NotConfigured,

    /// <summary>Companion está descargando archivos del bundle.</summary>
    Downloading,

    /// <summary>Faltan archivos y aún no hay URL para bajarlos (release sin prefetch).</summary>
    Missing,

    /// <summary>Todos los archivos del bundle están en disco.</summary>
    Ready
}

public sealed record ModelInstallStatus(
    string ModelsDirectory,
    string? DefaultModelId,
    ModelInstallPhase Phase,
    string? ActiveBundleId,
    string Message);