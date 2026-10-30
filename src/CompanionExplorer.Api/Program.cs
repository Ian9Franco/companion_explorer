using CompanionExplorer.Core;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://127.0.0.1:3000")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var brandId = builder.Configuration["COMPANION_BRAND"]
    ?? Environment.GetEnvironmentVariable("COMPANION_BRAND");
var brands = BrandStore.Load(AppContext.BaseDirectory, brandId);
builder.Services.AddSingleton(brands);

var app = builder.Build();
app.UseCors();

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

app.Run();

public partial class Program;
