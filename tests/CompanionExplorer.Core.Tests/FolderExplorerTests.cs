using CompanionExplorer.Core;

namespace CompanionExplorer.Core.Tests;

public class FolderExplorerTests
{
    [Fact]
    public void Lista_archivos_multimedia_y_subcarpetas_ignorando_otros_archivos()
    {
        using var sandbox = new TempMediaFolder();
        sandbox.CreateFile("portada.jpg", 1200);
        sandbox.CreateFile("clip.mp4", 5000);
        sandbox.CreateFile("tema.mp3", 3200);
        sandbox.CreateFile("notas.txt", 400);
        sandbox.CreateFile(".oculto.jpg", 300);
        sandbox.CreateSubfolder("Vacaciones");

        var explorer = new FolderExplorer();
        var listing = explorer.ListFolder(sandbox.Path);

        Assert.Equal(3, listing.Files.Count);
        Assert.Single(listing.Folders);
        Assert.Equal("Vacaciones", listing.Folders[0].Name);

        Assert.Equal(3, listing.Summary.TotalCount);
        Assert.Equal(1, listing.Summary.ImageCount);
        Assert.Equal(1, listing.Summary.VideoCount);
        Assert.Equal(1, listing.Summary.AudioCount);
        Assert.Equal(9400, listing.Summary.TotalBytes);
        Assert.NotEmpty(listing.Breadcrumbs);
    }

    [Fact]
    public void Filtra_por_tipo_manteniendo_los_contadores_del_resumen()
    {
        using var sandbox = new TempMediaFolder();
        sandbox.CreateFile("foto1.png", 1000);
        sandbox.CreateFile("foto2.webp", 1500);
        sandbox.CreateFile("video1.webm", 4000);
        sandbox.CreateFile("audio1.wav", 2000);

        var explorer = new FolderExplorer();
        var listing = explorer.ListFolder(sandbox.Path, new FolderQuery(Kind: "video"));

        Assert.Single(listing.Files);
        Assert.Equal("video1.webm", listing.Files[0].Name);
        Assert.Equal("video", listing.Files[0].Kind);

        Assert.Equal(4, listing.Summary.TotalCount);
        Assert.Equal(2, listing.Summary.ImageCount);
        Assert.Equal(1, listing.Summary.VideoCount);
        Assert.Equal(1, listing.Summary.AudioCount);
    }

    [Fact]
    public void Aplana_subcarpetas_en_modo_recursivo_y_busca_sin_importar_el_orden()
    {
        using var sandbox = new TempMediaFolder();
        sandbox.CreateFile("raiz.jpg", 500);
        sandbox.CreateFile(Path.Combine("2026", "Asado", "amigos_noche.jpg"), 1800);
        sandbox.CreateFile(Path.Combine("2026", "Asado", "fuego.mp4"), 3500);

        var explorer = new FolderExplorer();

        var direct = explorer.ListFolder(sandbox.Path, new FolderQuery(Recursive: false));
        Assert.Single(direct.Files);

        var flattened = explorer.ListFolder(
            sandbox.Path,
            new FolderQuery(Search: "noche asado", Recursive: true));

        Assert.Single(flattened.Files);
        Assert.Equal("amigos_noche.jpg", flattened.Files[0].Name);
        Assert.Equal("2026/Asado/amigos_noche.jpg", flattened.Files[0].RelativePath);
    }

    [Fact]
    public void Ordena_por_tamano_y_nombre()
    {
        using var sandbox = new TempMediaFolder();
        sandbox.CreateFile("b_medio.jpg", 2000);
        sandbox.CreateFile("a_chico.jpg", 500);
        sandbox.CreateFile("c_grande.jpg", 9000);

        var explorer = new FolderExplorer();

        var bySizeDesc = explorer.ListFolder(sandbox.Path, new FolderQuery(SortBy: "size", Descending: true));
        Assert.Equal(["c_grande.jpg", "b_medio.jpg", "a_chico.jpg"], bySizeDesc.Files.Select(f => f.Name).ToArray());

        var byNameAsc = explorer.ListFolder(sandbox.Path, new FolderQuery(SortBy: "name", Descending: false));
        Assert.Equal(["a_chico.jpg", "b_medio.jpg", "c_grande.jpg"], byNameAsc.Files.Select(f => f.Name).ToArray());
    }

    private sealed class TempMediaFolder : IDisposable
    {
        public TempMediaFolder()
        {
            Path = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                "companion-media-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void CreateSubfolder(string relativePath)
        {
            Directory.CreateDirectory(System.IO.Path.Combine(Path, relativePath));
        }

        public string CreateFile(string relativePath, int sizeBytes)
        {
            var full = System.IO.Path.Combine(Path, relativePath);
            var dir = System.IO.Path.GetDirectoryName(full);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            var data = new byte[sizeBytes];
            File.WriteAllBytes(full, data);
            return full;
        }

        public void Dispose()
        {
            if (Directory.Exists(Path))
                Directory.Delete(Path, recursive: true);
        }
    }
}
