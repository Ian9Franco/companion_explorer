using System.Windows;

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
        var url = Environment.GetEnvironmentVariable("COMPANION_WEB_URL") ?? "http://localhost:3000";
        await Vista.EnsureCoreWebView2Async();
        Title = "Companion Explorer";
        Vista.Source = new Uri(url);
    }
}
