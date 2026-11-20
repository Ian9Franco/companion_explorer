using CompanionExplorer.Core.Search;

namespace CompanionExplorer.Api;

public static class BrainEndpoints
{
    public static void MapBrainEndpoints(this WebApplication app)
    {
        app.MapGet("/brain/status", (BrainSearchService brain) => Results.Ok(brain.GetStatus()));

        app.MapGet("/brain/settings", (BrainConfigurationService config) => Results.Ok(config.GetView()));

        app.MapPut("/brain/settings", async (BrainSettingsPatch? patch, BrainConfigurationService config, CancellationToken cancellationToken) =>
        {
            if (patch is null)
                return Results.BadRequest(new { error = "Cuerpo JSON obligatorio." });

            try
            {
                var view = await config.ApplyPatchAsync(patch, cancellationToken);
                return Results.Ok(view);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

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