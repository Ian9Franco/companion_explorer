namespace CompanionExplorer.Core.Search;

public sealed record BrainStatus(
    string Phase,
    bool IndexReady,
    bool EmbedderReady,
    string? ModelId,
    int IndexedVectors,
    string ModelsDirectory,
    string ModelInstallPhase,
    string? Message);

public sealed record BrainSearchHit(string Path, double Score);

public sealed record BrainSearchResponse(
    string Query,
    string Phase,
    bool IndexReady,
    bool EmbedderReady,
    IReadOnlyList<BrainSearchHit> Results,
    string Message);

/// <summary>
/// Orquesta la búsqueda visual. Hoy responde con estado; el índice y el embedder vienen después.
/// </summary>
public sealed class BrainSearchService
{
    private readonly IEmbedder _embedder;
    private readonly ModelInstaller _modelInstaller;

    public BrainSearchService(IEmbedder embedder, ModelInstaller modelInstaller)
    {
        _embedder = embedder;
        _modelInstaller = modelInstaller;
    }

    public BrainStatus GetStatus()
    {
        var install = _modelInstaller.CurrentStatus;
        var modelId = _embedder.Model.Id == NullEmbedder.PlaceholderModel.Id
            ? install.ActiveBundleId ?? install.DefaultModelId
            : _embedder.Model.Id;

        return new BrainStatus(
            Phase: "foundation",
            IndexReady: false,
            EmbedderReady: _embedder.IsReady,
            ModelId: modelId,
            IndexedVectors: 0,
            ModelsDirectory: install.ModelsDirectory,
            ModelInstallPhase: install.Phase.ToString().ToLowerInvariant(),
            Message: CombineMessages(install.Message,
                "Los modelos viven junto al programa (carpeta models/), no en AppData."));
    }

    private static string CombineMessages(string primary, string secondary)
    {
        if (string.IsNullOrWhiteSpace(primary))
            return secondary;
        if (primary.Contains("AppData", StringComparison.Ordinal))
            return primary;
        return $"{primary} {secondary}";
    }

    public async Task<BrainSearchResponse> SearchAsync(string query, int limit, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query))
            throw new ArgumentException("La consulta no puede estar vacía.", nameof(query));

        limit = Math.Clamp(limit, 1, 200);
        var trimmed = query.Trim();
        _ = await _embedder.EmbedTextAsync(trimmed, cancellationToken);

        return new BrainSearchResponse(
            Query: trimmed,
            Phase: "foundation",
            IndexReady: false,
            EmbedderReady: _embedder.IsReady,
            Results: Array.Empty<BrainSearchHit>(),
            Message: "Todavía no hay índice visual. La grilla muestra el catálogo manual.");
    }
}