namespace CompanionExplorer.Core.Catalog;

public sealed record LibraryRecord(
    long Id,
    string Path,
    string Name,
    DateTimeOffset AddedUtc,
    DateTimeOffset? LastScanUtc,
    int FileCount,
    long TotalBytes);

public sealed record LibraryAddResult(
    LibraryRecord Library,
    bool Created,
    IReadOnlyList<long> AbsorbedLibraryIds);

public sealed record CatalogFile(
    long Id,
    string Name,
    string Path,
    string Folder,
    string Extension,
    string Kind,
    long SizeBytes,
    DateTimeOffset ModifiedUtc,
    long? LibraryId);

public sealed record CatalogPage(
    int Total,
    int Offset,
    IReadOnlyList<CatalogFile> Items);

public enum CatalogSort
{
    Date,
    Name,
    Size,
    Type
}

/// <summary>
/// With no library and no collection, the filter covers every indexed library
/// and leaves out files that only live in a collection.
/// </summary>
public sealed record CatalogFilter(
    long? LibraryId = null,
    long? CollectionId = null,
    MediaKind? Kind = null,
    IReadOnlyList<string>? Extensions = null,
    string? Search = null,
    long? FromUtcMs = null,
    long? ToUtcMs = null);

public sealed record KindCounts(int Image, int Video, int Audio);

public sealed record ExtensionCount(string Extension, int Count);

public sealed record TimelineBucket(int Year, int Month, int Count);

/// <summary>
/// Kind counts ignore the kind and extension filters, extension counts ignore only
/// the extension filter, and the timeline ignores the date range, so each control
/// keeps showing its alternatives while it is active.
/// </summary>
public sealed record CatalogSummary(
    int TotalCount,
    long TotalBytes,
    KindCounts Kinds,
    IReadOnlyList<ExtensionCount> Extensions,
    IReadOnlyList<TimelineBucket> Timeline);

public sealed record CollectionRecord(
    long Id,
    string Name,
    int ItemCount,
    string? CoverPath,
    DateTimeOffset CreatedUtc,
    DateTimeOffset UpdatedUtc);

public sealed record ScanResult(
    int Indexed,
    int Removed,
    long TotalBytes,
    bool Completed);

public sealed class CatalogConflictException(string message) : Exception(message);
