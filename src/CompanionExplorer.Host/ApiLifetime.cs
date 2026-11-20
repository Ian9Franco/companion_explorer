using System.Diagnostics;
using System.IO;
using System.Net.Http;

namespace CompanionExplorer.Host;

/// <summary>
/// Levanta el API publicado al lado de la ventana, sin consola.
/// En desarrollo, si no hay exe, asume que ya corre en el puerto 5080.
/// </summary>
public static class ApiLifetime
{
    private static Process? _api;

    public static async Task EnsureRunningAsync(CancellationToken cancellationToken = default)
    {
        if (await IsHealthyAsync(cancellationToken))
            return;

        var apiExe = FindApiExecutable();
        if (apiExe is null)
            return;

        var apiDir = Path.GetDirectoryName(apiExe)!;

        _api = Process.Start(new ProcessStartInfo
        {
            FileName = apiExe,
            WorkingDirectory = apiDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });

        if (_api is null)
            throw new InvalidOperationException("No se pudo iniciar el núcleo.");

        var deadline = DateTime.UtcNow.AddSeconds(45);
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (_api.HasExited)
                throw new InvalidOperationException($"El núcleo se cerró (código {_api.ExitCode}). Revisá companion-api.err.log.");

            if (await IsHealthyAsync(cancellationToken))
                return;

            await Task.Delay(250, cancellationToken);
        }

        throw new TimeoutException("El núcleo no respondió en 127.0.0.1:5080.");
    }

    public static void Stop()
    {
        if (_api is null || _api.HasExited)
            return;

        try
        {
            _api.Kill(entireProcessTree: true);
        }
        catch
        {
            // The window is already closing.
        }
    }

    private static string? FindApiExecutable()
    {
        var direct = Path.Combine(AppContext.BaseDirectory, "api", "CompanionExplorer.Api.exe");
        return File.Exists(direct) ? direct : null;
    }

    private static async Task<bool> IsHealthyAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            using var response = await http.GetAsync("http://127.0.0.1:5080/health", cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}