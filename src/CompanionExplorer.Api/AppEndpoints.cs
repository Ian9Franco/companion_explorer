using System.Diagnostics;

namespace CompanionExplorer.Api;

public static class AppEndpoints
{
    public static void MapAppEndpoints(this WebApplication app)
    {
        app.MapGet("/app/version", (AppUpdateService updates) => Results.Ok(new
        {
            version = updates.CurrentVersion
        }));

        app.MapGet("/app/update", async (AppUpdateService updates, CancellationToken cancellationToken) =>
            Results.Ok(await updates.CheckAsync(cancellationToken)));

        app.MapPost("/app/update/download", async (AppUpdateService updates, CancellationToken cancellationToken) =>
        {
            try
            {
                var path = await updates.DownloadInstallerAsync(cancellationToken);
                Process.Start(new ProcessStartInfo
                {
                    FileName = path,
                    Arguments = "/SILENT /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS",
                    UseShellExecute = true
                });
                return Results.Ok(new { started = true, installer = path });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });
    }
}