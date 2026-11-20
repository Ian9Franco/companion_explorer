using CompanionExplorer.Core;

namespace CompanionExplorer.Core.Tests;

public class AppVersionTests
{
    [Theory]
    [InlineData("0.2.0", "0.1.2", true)]
    [InlineData("v0.1.3", "0.1.2", true)]
    [InlineData("0.1.2", "0.1.2", false)]
    [InlineData("0.1.1", "0.1.2", false)]
    public void Detecta_si_la_release_es_mas_nueva(string latest, string current, bool newer)
    {
        Assert.Equal(newer, AppVersion.IsNewer(latest, current));
    }
}