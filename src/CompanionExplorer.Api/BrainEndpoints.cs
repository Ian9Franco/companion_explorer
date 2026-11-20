using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Api;

public static class BrainEndpoints
{
    public static void MapBrainEndpoints(this WebApplication app)
    {
        app.MapGet("/brain/status", (BrainSearchService brain) => Results.Ok(brain.GetStatus()));

        app.MapGet("/brain/search", async (string? q, int? limit, BrainSearchService brain, CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(q))
                return Results.BadRequest(new { error = "El parámetro 'q' es obligatorio." });

            try
            {
                var response = await brain.SearchAsync(q, limit ?? 48, cancellationToken);
                return Results.Ok(response);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });
    }
}