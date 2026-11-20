using System.Net.Http.Headers;
using System.Text.Json;
using CompanionExplorer.Core;

namespace CompanionExplorer.Api;

public sealed record AppUpdateInfo(
    string Current,
    string? Latest,
    bool UpdateAvailable,
    string? DownloadUrl,
    string? AssetName,
    string? ReleaseNotesUrl,
    string Message);

public sealed class AppUpdateService
{
    public const string Repository = "Ian9Franco/companion_explorer";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public string CurrentVersion { get; } = AppVersion.Read();

    public async Task<AppUpdateInfo> CheckAsync(CancellationToken cancellationToken)
    {
        var current = CurrentVersion;
        try
        {
            using var http = CreateClient();
            using var response = await http.GetAsync(
                $"https://api.github.com/repos/{Repository}/releases/latest",
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return new AppUpdateInfo(current, null, false, null, null, null,
                    "No se pudo consultar GitHub.");
            }

            var payload = await response.Content.ReadFromJsonAsync<GitHubRelease>(JsonOptions, cancellationToken);
            var latest = payload?.TagName?.Trim().TrimStart('v', 'V');
            var asset = payload?.Assets?.FirstOrDefault(a =>
                a.Name.Contains("Setup", StringComparison.OrdinalIgnoreCase) &&
                a.Name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase));

            var available = !string.IsNullOrWhiteSpace(latest) && AppVersion.IsNewer(latest, current) && asset?.BrowserDownloadUrl is not null;
            return new AppUpdateInfo(
                current,
                latest,
                available,
                asset?.BrowserDownloadUrl,
                asset?.Name,
                payload?.HtmlUrl,
                available
                    ? $"Hay una versión nueva: {latest}."
                    : "Companion está al día.");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new AppUpdateInfo(current, null, false, null, null, null, "Sin conexión para buscar actualizaciones.");
        }
    }

    public async Task<string> DownloadInstallerAsync(CancellationToken cancellationToken)
    {
        var info = await CheckAsync(cancellationToken);
        if (!info.UpdateAvailable || string.IsNullOrWhiteSpace(info.DownloadUrl))
            throw new InvalidOperationException(info.Message);

        var target = Path.Combine(Path.GetTempPath(), info.AssetName ?? "CompanionExplorer-Setup.exe");
        using var http = CreateClient();
        await using var stream = await http.GetStreamAsync(info.DownloadUrl, cancellationToken);
        await using var file = File.Create(target);
        await stream.CopyToAsync(file, cancellationToken);
        return target;
    }

    private static HttpClient CreateClient()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("CompanionExplorer", AppVersion.Read()));
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        return http;
    }

    private sealed class GitHubRelease
    {
        public string? TagName { get; set; }
        public string? HtmlUrl { get; set; }
        public List<GitHubAsset>? Assets { get; set; }
    }

    private sealed class GitHubAsset
    {
        public string Name { get; set; } = "";
        public string? BrowserDownloadUrl { get; set; }
    }
}