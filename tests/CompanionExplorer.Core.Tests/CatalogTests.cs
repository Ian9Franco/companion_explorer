using CompanionExplorer.Core;
using CompanionExplorer.Core.Catalog;
using Microsoft.Data.Sqlite;

namespace CompanionExplorer.Core.Tests;

public class CatalogTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "companion-catalog-" + Guid.NewGuid().ToString("N"));
    private readonly string _media;
    private readonly CatalogStore _store;
    private readonly CatalogScanner _scanner;

    public CatalogTests()
    {
        _media = Path.Combine(_root, "media");
        Directory.CreateDirectory(_media);
        _store = new CatalogStore(Path.Combine(_root, "data", "catalog.db"));
        _scanner = new CatalogScanner(_store);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    [Fact]
    public void El_escaneo_indexa_solo_multimedia_y_no_escribe_en_la_carpeta()
    {
        File("Viajes/playa.jpg", 1000, new DateTime(2025, 1, 15, 12, 0, 0));
        File("Viajes/ola.mp4", 4000, new DateTime(2025, 2, 15, 12, 0, 0));
        File("Musica/tema.mp3", 2000, new DateTime(2026, 3, 15, 12, 0, 0));
        File("notas.txt", 50, new DateTime(2026, 3, 15, 12, 0, 0));
        File(".oculta/secreta.jpg", 50, new DateTime(2026, 3, 15, 12, 0, 0));
        var before = Directory.GetFileSystemEntries(_media, "*", SearchOption.AllDirectories).Order().ToArray();

        var library = _store.AddLibrary(_media).Library;
        var result = _scanner.Scan(library.Id);

        Assert.True(result.Completed);
        Assert.Equal(3, result.Indexed);
        Assert.Equal(before, Directory.GetFileSystemEntries(_media, "*", SearchOption.AllDirectories).Order().ToArray());

        var refreshed = _store.GetLibrary(library.Id)!;
        Assert.Equal(3, refreshed.FileCount);
        Assert.Equal(7000, refreshed.TotalBytes);
        Assert.NotNull(refreshed.LastScanUtc);
    }

    [Fact]
    public void Reescanear_quita_lo_borrado_y_actualiza_lo_cambiado()
    {
        var keep = File("a.jpg", 100, new DateTime(2025, 5, 15, 12, 0, 0));
        var gone = File("b.jpg", 100, new DateTime(2025, 5, 15, 12, 0, 0));
        var library = _store.AddLibrary(_media).Library;
        _scanner.Scan(library.Id);

        System.IO.File.Delete(gone);
        System.IO.File.WriteAllBytes(keep, new byte[900]);
        File("c.png", 100, new DateTime(2025, 6, 15, 12, 0, 0));

        var result = _scanner.Scan(library.Id);
        var page = _store.QueryFiles(new CatalogFilter(LibraryId: library.Id), CatalogSort.Name, descending: false);

        Assert.Equal(1, result.Removed);
        Assert.Equal(["a.jpg", "c.png"], page.Items.Select(f => f.Name).ToArray());
        Assert.Equal(900, page.Items[0].SizeBytes);
    }

    [Fact]
    public void Filtra_por_tipo_extension_busqueda_sin_acentos_y_fechas()
    {
        File("Cumpleaños/torta.jpg", 100, new DateTime(2025, 1, 15, 12, 0, 0));
        File("Cumpleaños/velas.png", 100, new DateTime(2025, 2, 15, 12, 0, 0));
        File("Cumpleaños/canción.mp3", 100, new DateTime(2025, 2, 15, 12, 0, 0));
        File("Trabajo/logo.png", 100, new DateTime(2026, 7, 15, 12, 0, 0));
        var library = _store.AddLibrary(_media).Library;
        _scanner.Scan(library.Id);

        var images = _store.QueryFiles(new CatalogFilter(Kind: MediaKind.Image));
        Assert.Equal(3, images.Total);

        var png = _store.QueryFiles(new CatalogFilter(Extensions: ["png"]));
        Assert.Equal(2, png.Total);

        var search = _store.QueryFiles(new CatalogFilter(Search: "cumpleanos cancion"));
        Assert.Equal("canción.mp3", Assert.Single(search.Items).Name);

        var february = _store.QueryFiles(new CatalogFilter(
            FromUtcMs: new DateTimeOffset(2025, 2, 1, 0, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(),
            ToUtcMs: new DateTimeOffset(2025, 3, 1, 0, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds()));
        Assert.Equal(2, february.Total);
    }

    [Fact]
    public void Pagina_en_orden_estable()
    {
        for (var i = 0; i < 25; i++)
            File($"foto{i:00}.jpg", 100 + i, new DateTime(2025, 1, 1, 12, 0, 0).AddDays(i));
        var library = _store.AddLibrary(_media).Library;
        _scanner.Scan(library.Id);

        var first = _store.QueryFiles(new CatalogFilter(), CatalogSort.Date, descending: true, offset: 0, limit: 10);
        var second = _store.QueryFiles(new CatalogFilter(), CatalogSort.Date, descending: true, offset: 10, limit: 10);

        Assert.Equal(25, first.Total);
        Assert.Equal("foto24.jpg", first.Items[0].Name);
        Assert.Equal("foto14.jpg", second.Items[0].Name);
        Assert.Empty(first.Items.Select(f => f.Path).Intersect(second.Items.Select(f => f.Path)));
    }

    [Fact]
    public void El_resumen_mantiene_visibles_las_alternativas_del_filtro_activo()
    {
        File("a.jpg", 100, new DateTime(2025, 1, 15, 12, 0, 0));
        File("b.png", 200, new DateTime(2025, 1, 15, 12, 0, 0));
        File("c.mp4", 300, new DateTime(2026, 4, 15, 12, 0, 0));
        File("d.mp3", 400, new DateTime(2026, 4, 15, 12, 0, 0));
        var library = _store.AddLibrary(_media).Library;
        _scanner.Scan(library.Id);

        var summary = _store.Summarize(new CatalogFilter(
            Kind: MediaKind.Image,
            Extensions: ["jpg"],
            FromUtcMs: new DateTimeOffset(2025, 1, 1, 0, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(),
            ToUtcMs: new DateTimeOffset(2025, 2, 1, 0, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds()));

        Assert.Equal(1, summary.TotalCount);
        Assert.Equal(100, summary.TotalBytes);
        Assert.Equal(new KindCounts(2, 0, 0), summary.Kinds);
        Assert.Equal([".jpg", ".png"], summary.Extensions.Select(e => e.Extension).Order().ToArray());
        var bucket = Assert.Single(summary.Timeline);
        Assert.Equal((2025, 1, 1), (bucket.Year, bucket.Month, bucket.Count));
    }

    [Fact]
    public void Las_colecciones_agrupan_archivos_de_distintas_rutas()
    {
        var inLibrary = File("lib/uno.jpg", 100, new DateTime(2025, 1, 15, 12, 0, 0));
        var loose = File("suelta/dos.png", 100, new DateTime(2025, 1, 15, 12, 0, 0));
        var library = _store.AddLibrary(Path.Combine(_media, "lib")).Library;
        _scanner.Scan(library.Id);

        var collection = _store.CreateCollection("  Portadas  ");
        Assert.Equal("Portadas", collection.Name);

        Assert.Equal(2, _store.AddToCollection(collection.Id, [inLibrary, loose, loose]));
        Assert.Equal(0, _store.AddToCollection(collection.Id, [inLibrary]));

        var items = _store.QueryFiles(new CatalogFilter(CollectionId: collection.Id));
        Assert.Equal(2, items.Total);

        // A browsed file inside a collection does not leak into the "all libraries" view.
        Assert.Equal(1, _store.QueryFiles(new CatalogFilter()).Total);

        var listed = Assert.Single(_store.ListCollections());
        Assert.Equal(2, listed.ItemCount);
        Assert.NotNull(listed.CoverPath);

        Assert.Equal(1, _store.RemoveFromCollection(collection.Id, [loose]));
        Assert.Equal(1, _store.QueryFiles(new CatalogFilter(CollectionId: collection.Id)).Total);
    }

    [Fact]
    public void Quitar_una_biblioteca_conserva_lo_que_esta_en_colecciones()
    {
        var kept = File("x.jpg", 100, new DateTime(2025, 1, 15, 12, 0, 0));
        File("y.jpg", 100, new DateTime(2025, 1, 15, 12, 0, 0));
        var library = _store.AddLibrary(_media).Library;
        _scanner.Scan(library.Id);
        var collection = _store.CreateCollection("Favoritas");
        _store.AddToCollection(collection.Id, [kept]);

        Assert.True(_store.RemoveLibrary(library.Id));

        Assert.Empty(_store.ListLibraries());
        Assert.Equal(0, _store.QueryFiles(new CatalogFilter()).Total);
        Assert.Equal(kept, Assert.Single(_store.QueryFiles(new CatalogFilter(CollectionId: collection.Id)).Items).Path);
        Assert.True(System.IO.File.Exists(kept));
    }

    [Fact]
    public void Una_biblioteca_dentro_de_otra_se_rechaza_y_una_superior_absorbe()
    {
        File("2025/a.jpg", 100, new DateTime(2025, 1, 15, 12, 0, 0));
        Directory.CreateDirectory(Path.Combine(_media, "2026"));

        var child = _store.AddLibrary(Path.Combine(_media, "2025")).Library;
        _scanner.Scan(child.Id);

        var again = _store.AddLibrary(Path.Combine(_media, "2025") + Path.DirectorySeparatorChar);
        Assert.False(again.Created);
        Assert.Equal(child.Id, again.Library.Id);

        var parent = _store.AddLibrary(_media);
        Assert.Equal([child.Id], parent.AbsorbedLibraryIds);
        Assert.Equal(parent.Library.Id, Assert.Single(_store.ListLibraries()).Id);
        Assert.Equal(1, parent.Library.FileCount);

        Assert.Throws<CatalogConflictException>(() => _store.AddLibrary(Path.Combine(_media, "2026")));
    }

    private string File(string relativePath, int size, DateTime modifiedUtc)
    {
        var full = Path.Combine(_media, relativePath.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        System.IO.File.WriteAllBytes(full, new byte[size]);
        System.IO.File.SetLastWriteTimeUtc(full, DateTime.SpecifyKind(modifiedUtc, DateTimeKind.Utc));
        return full;
    }
}
