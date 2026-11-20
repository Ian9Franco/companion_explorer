using System.Windows;

namespace CompanionExplorer.Host;

public partial class App : Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var splash = new SplashWindow();
        splash.Show();

        try
        {
            await ApiLifetime.EnsureRunningAsync();
        }
        catch (Exception ex)
        {
            splash.Close();
            MessageBox.Show(ex.Message, "Companion Explorer", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
            return;
        }

        var window = new MainWindow();
        MainWindow = window;
        window.Show();
        splash.Close();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        ApiLifetime.Stop();
        base.OnExit(e);
    }
}