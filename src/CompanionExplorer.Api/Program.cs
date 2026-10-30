using CompanionExplorer.Api;
using CompanionExplorer.Core;
using CompanionExplorer.Core.Catalog;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "https://companion.local")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var brandId = builder.Configuration["COMPANION_BRAND"]
    ?? Environment.GetEnvironmentVariable("COMPANION_BRAND");
var brands = BrandStore.Load(AppContext.BaseDirectory, brandId);
builder.Services.AddSingleton(brands);
builder.Services.AddSingleton<FolderExplorer>();

// Un solo directorio de datos, fuera de las carpetas del usuario: catalog.db y cache/thumbs.
var dataDirectory = AppDataPaths.Resolve(builder.Configuration["COMPANION_DATA_DIR"]);
builder.Services.AddSingleton<IThumbnailSource>(_ =>
    new ThumbnailService(Path.Combine(dataDirectory, "cache", "thumbs")));
builder.Services.AddSingleton(_ => new CatalogStore(Path.Combine(dataDirectory, "catalog.db")));
builder.Services.AddSingleton<CatalogScanner>();
builder.Services.AddSingleton<CatalogScanWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<CatalogScanWorker>());

var app = builder.Build();
app.UseCors();
app.MapCatalogEndpoints();

app.MapGet("/health", (BrandStore store) => Results.Ok(new
{
    status = "ok",
    product = store.Current.ProductName
}));

app.MapGet("/brand", (BrandStore store) => Results.Ok(new
{
    store.Current.Id,
    store.Current.ProductName,
    store.Current.WindowTitle,
    store.Current.PreloadTitle,
    logoUrl = "/brand/logo"
}));

app.MapGet("/brand/logo", (BrandStore store) =>
{
    if (!File.Exists(store.LogoPath))
        return Results.NotFound();
    return Results.File(store.LogoPath, "image/svg+xml");
});

app.MapGet("/roots", (FolderExplorer explorer) =>
{
    var extraRoot = Environment.GetEnvironmentVariable("COMPANION_DEFAULT_FOLDER");
    return Results.Ok(new
    {
        roots = explorer.GetRoots(extraRoot)
    });
});

app.MapGet("/folders", (
    string? path,
    string? kind,
    string? search,
    string? sort,
    bool? desc,
    bool? recursive,
    FolderExplorer explorer) =>
{
    if (string.IsNullOrWhiteSpace(path))
        return Results.BadRequest(new { error = "El parámetro 'path' es obligatorio." });

    try
    {
        var listing = explorer.ListFolder(path, new FolderQuery(
            Kind: kind,
            Search: search,
            SortBy: sort ?? "date",
            Descending: desc,
            Recursive: recursive ?? false));

        return Results.Ok(listing);
    }
    catch (DirectoryNotFoundException ex)
    {
        return Results.NotFound(new { error = ex.Message });
    }
    catch (ArgumentException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapMethods("/thumb", ["GET", "HEAD"], async (
    string? path,
    int? size,
    HttpContext httpContext,
    IThumbnailSource thumbnailSource,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(path))
        return Results.BadRequest(new { error = "El parámetro 'path' es obligatorio." });

    var fullPath = FolderExplorer.NormalizePath(path);
    if (!File.Exists(fullPath) || !MediaTypes.TryGetKind(fullPath, out _))
        return Results.NotFound(new { error = "No existe el archivo multimedia solicitado." });

    var result = await thumbnailSource.GetThumbnailAsync(fullPath, size ?? 256, cancellationToken);
    if (result is null)
        return Results.NoContent();

    if (httpContext.Request.Headers.IfNoneMatch.Contains(result.ETag))
        return Results.StatusCode(StatusCodes.Status304NotModified);

    httpContext.Response.Headers.ETag = result.ETag;
    httpContext.Response.Headers.CacheControl = "public, max-age=86400";
    return Results.Bytes(result.Bytes, result.ContentType);
});

app.MapMethods("/file", ["GET", "HEAD"], (string? path) =>
{
    if (string.IsNullOrWhiteSpace(path))
        return Results.BadRequest(new { error = "El parámetro 'path' es obligatorio." });

    var fullPath = FolderExplorer.NormalizePath(path);
    var fileInfo = new FileInfo(fullPath);
    if (!fileInfo.Exists || !MediaTypes.TryGetKind(fileInfo.Extension, out _))
        return Results.NotFound(new { error = "No existe el archivo multimedia solicitado." });

    var contentType = MediaTypes.GetContentType(fileInfo.Extension);
    var lastModified = new DateTimeOffset(fileInfo.LastWriteTimeUtc, TimeSpan.Zero);

    return Results.File(
        fullPath,
        contentType: contentType,
        lastModified: lastModified,
        enableRangeProcessing: true);
});

app.Run();

public partial class Program;
