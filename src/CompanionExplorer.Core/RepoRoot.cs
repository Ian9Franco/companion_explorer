namespace CompanionExplorer.Core;

public static class RepoRoot
{
    public static string Find(string startDirectory)
    {
        var dir = new DirectoryInfo(Path.GetFullPath(startDirectory));
        while (dir is not null)
        {
            var brands = Path.Combine(dir.FullName, "brands");
            if (Directory.Exists(brands))
                return dir.FullName;
            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException(
            "No se encontró la carpeta brands/. Ejecutá el API desde el repositorio.");
    }
}
