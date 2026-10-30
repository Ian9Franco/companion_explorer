using System.IO;
using System.Text.Json;
using System.Windows;
using CompanionExplorer.Core;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace CompanionExplorer.Host;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        var brandId = Environment.GetEnvironmentVariable("COMPANION_BRAND");
        try
        {
            var store = BrandStore.Load(AppContext.BaseDirectory, brandId);
            Title = store.Current.WindowTitle;
        }
        catch
        {
            Title = "Companion Explorer";
        }

        await Vista.EnsureCoreWebView2Async();
        Vista.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

        var configuredUrl = Environment.GetEnvironmentVariable("COMPANION_WEB_URL");
        if (!string.IsNullOrWhiteSpace(configuredUrl))
        {
            Vista.Source = new Uri(configuredUrl);
            return;
        }

        var staticDir = FindStaticExportDirectory();
        if (staticDir is not null)
        {
            Vista.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "companion.local",
                staticDir,
                CoreWebView2HostResourceAccessKind.Allow);
            Vista.Source = new Uri("https://companion.local/index.html");
            return;
        }

        Vista.Source = new Uri("http://localhost:3000");
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        var message = e.TryGetWebMessageAsString();
        if (!string.Equals(message, "pick-folder", StringComparison.Ordinal))
            return;

        var dialog = new OpenFolderDialog
        {
            Title = "Elegir carpeta para explorar"
        };

        if (dialog.ShowDialog(this) == true && !string.IsNullOrWhiteSpace(dialog.FolderName))
        {
            var payload = JsonSerializer.Serialize(new
            {
                type = "folder-picked",
                path = dialog.FolderName
            });
            Vista.CoreWebView2.PostWebMessageAsJson(payload);
        }
    }

    private static string? FindStaticExportDirectory()
    {
        var directOut = Path.Combine(AppContext.BaseDirectory, "out");
        if (Directory.Exists(directOut))
            return directOut;

        try
        {
            var repoRoot = RepoRoot.Find(AppContext.BaseDirectory);
            var repoOut = Path.Combine(repoRoot, "frontend", "out");
            if (Directory.Exists(repoOut))
                return repoOut;
        }
        catch
        {
            // Ignore when running outside repository layout
        }

        return null;
    }
}
