using CompanionExplorer.Core;
using CompanionExplorer.Core.Catalog;

namespace CompanionExplorer.Api;

public sealed record LibraryDto(
    long Id,
    string Path,
    string Name,
    DateTimeOffset AddedUtc,
    DateTimeOffset? LastScanUtc,
    int FileCount,
    long TotalBytes,
    string Status,
    int ScannedCount,
    string? Error);

public sealed record PathRequest(string? Path);

public sealed record NameRequest(string? Name);

public sealed record PathsRequest(IReadOnlyList<string>? Paths);

public static class CatalogEndpoints
{
    public static void MapCatalogEndpoints(this WebApplication app)
    {
        app.MapGet("/libraries", (CatalogStore store, CatalogScanWorker worker) =>
        {
            var libraries = store.ListLibraries().Select(l => ToDto(l, worker)).ToList();
            return Results.Ok(new
            {
                libraries,
                scanning = libraries.Any(l => l.Status is "queued" or "scanning")
            });
        });

        app.MapPost("/libraries", (PathRequest request, CatalogStore store, CatalogScanWorker worker) =>
        {
            if (string.IsNullOrWhiteSpace(request.Path))
                return Results.BadRequest(new { error = "La ruta de la biblioteca es obligatoria." });

            try
            {
                var result = store.AddLibrary(request.Path);
                foreach (var absorbed in result.AbsorbedLibraryIds)
                    worker.Cancel(absorbed);
                worker.Enqueue(result.Library.Id);

                var dto = ToDto(result.Library, worker);
                return result.Created
                    ? Results.Created($"/libraries/{dto.Id}", new { library = dto, absorbedLibraryIds = result.AbsorbedLibraryIds })
                    : Results.Ok(new { library = dto, absorbedLibraryIds = result.AbsorbedLibraryIds });
            }
            catch (DirectoryNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
            catch (CatalogConflictException ex)
            {
                return Results.Conflict(new { error = ex.Message });
            }
        });

        app.MapPost("/libraries/{id:long}/scan", (long id, CatalogStore store, CatalogScanWorker worker) =>
        {
            var library = store.GetLibrary(id);
            if (library is null)
                return Results.NotFound(new { error = $"No existe la biblioteca {id}." });

            worker.Enqueue(id);
            return Results.Accepted($"/libraries/{id}", ToDto(library, worker));
        });

        app.MapDelete("/libraries/{id:long}", (long id, CatalogStore store, CatalogScanWorker worker) =>
        {
            worker.Cancel(id);
            return store.RemoveLibrary(id)
                ? Results.NoContent()
                : Results.NotFound(new { error = $"No existe la biblioteca {id}." });
        });

        app.MapGet("/catalog/files", (HttpRequest http, CatalogStore store) =>
        {
            if (!TryParseFilter(http, out var filter, out var error))
                return Results.BadRequest(new { error });

            var sort = ParseSort(http.Query["sort"]);
            var desc = bool.TryParse(http.Query["desc"], out var d) ? d : (bool?)null;
            var offset = int.TryParse(http.Query["offset"], out var o) ? o : 0;
            var limit = int.TryParse(http.Query["limit"], out var l) ? l : 200;

            return Results.Ok(store.QueryFiles(filter, sort, desc, offset, limit));
        });

        app.MapGet("/catalog/summary", (HttpRequest http, CatalogStore store) =>
        {
            if (!TryParseFilter(http, out var filter, out var error))
                return Results.BadRequest(new { error });

            return Results.Ok(store.Summarize(filter));
        });

        app.MapGet("/collections", (CatalogStore store) =>
            Results.Ok(new { collections = store.ListCollections() }));

        app.MapPost("/collections", (NameRequest request, CatalogStore store) =>
        {
            try
            {
                var collection = store.CreateCollection(request.Name ?? string.Empty);
                return Results.Created($"/collections/{collection.Id}", collection);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        app.MapPatch("/collections/{id:long}", (long id, NameRequest request, CatalogStore store) =>
        {
            try
            {
                var collection = store.RenameCollection(id, request.Name ?? string.Empty);
                return collection is null
                    ? Results.NotFound(new { error = $"No existe la colección {id}." })
                    : Results.Ok(collection);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        app.MapDelete("/collections/{id:long}", (long id, CatalogStore store) =>
            store.DeleteCollection(id)
                ? Results.NoContent()
                : Results.NotFound(new { error = $"No existe la colección {id}." }));

        app.MapPost("/collections/{id:long}/items", (long id, PathsRequest request, CatalogStore store) =>
            ChangeItems(id, request, paths => store.AddToCollection(id, paths), store, "added"));

        app.MapPost("/collections/{id:long}/items/remove", (long id, PathsRequest request, CatalogStore store) =>
            ChangeItems(id, request, paths => store.RemoveFromCollection(id, paths), store, "removed"));
    }

    private static IResult ChangeItems(
        long id,
        PathsRequest request,
        Func<IReadOnlyList<string>, int> change,
        CatalogStore store,
        string countName)
    {
        if (request.Paths is not { Count: > 0 } paths)
            return Results.BadRequest(new { error = "Hace falta al menos una ruta." });

        try
        {
            var count = change(paths);
            var collection = store.GetCollection(id);
            return Results.Ok(new Dictionary<string, object?>
            {
                [countName] = count,
                ["collection"] = collection
            });
        }
        catch (KeyNotFoundException ex)
        {
            return Results.NotFound(new { error = ex.Message });
        }
    }

    private static LibraryDto ToDto(LibraryRecord library, CatalogScanWorker worker)
    {
        var snapshot = worker.GetSnapshot(library.Id);
        var status = snapshot?.Status ?? "idle";
        if (status == "idle" && !Directory.Exists(library.Path))
            status = "missing";

        return new LibraryDto(
            library.Id,
            library.Path,
            library.Name,
            library.AddedUtc,
            library.LastScanUtc,
            library.FileCount,
            library.TotalBytes,
            status,
            snapshot?.Scanned ?? 0,
            snapshot?.Error);
    }

    private static bool TryParseFilter(HttpRequest http, out CatalogFilter filter, out string? error)
    {
        filter = new CatalogFilter();
        error = null;

        if (!MediaTypes.TryParseKindFilter(http.Query["kind"], out var kind))
        {
            error = $"Tipo de archivo inválido: '{http.Query["kind"]}'.";
            return false;
        }

        var extensions = http.Query["ext"].ToString()
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        filter = new CatalogFilter(
            LibraryId: long.TryParse(http.Query["library"], out var library) ? library : null,
            CollectionId: long.TryParse(http.Query["collection"], out var collection) ? collection : null,
            Kind: kind,
            Extensions: extensions,
            Search: http.Query["search"],
            FromUtcMs: long.TryParse(http.Query["from"], out var from) ? from : null,
            ToUtcMs: long.TryParse(http.Query["to"], out var to) ? to : null);
        return true;
    }

    private static CatalogSort ParseSort(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "name" => CatalogSort.Name,
        "size" => CatalogSort.Size,
        "type" => CatalogSort.Type,
        _ => CatalogSort.Date
    };
}
