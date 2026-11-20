namespace CompanionExplorer.Core.Search;

public sealed record BrainStatus(
    string Phase,
    bool IndexReady,
    bool EmbedderReady,
    string? ModelId,
    int IndexedVectors,
    string Message);

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

    public BrainSearchService(IEmbedder embedder)
    {
        _embedder = embedder;
    }

    public BrainStatus GetStatus() => new(
        Phase: "foundation",
        IndexReady: false,
        EmbedderReady: _embedder.IsReady,
        ModelId: _embedder.Model.Id,
        IndexedVectors: 0,
        Message: "Base lista: API y contrato de embeddings. Siguen el índice, el worker y el modelo ONNX.");

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