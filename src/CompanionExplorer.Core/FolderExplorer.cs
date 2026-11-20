namespace CompanionExplorer.Core;

public sealed record RootEntry(
    string Name,
    string Path,
    string Kind);

public sealed record BreadcrumbEntry(
    string Name,
    string Path);

public sealed record FolderEntry(
    string Name,
    string Path,
    DateTimeOffset ModifiedUtc);

public sealed record MediaFileEntry(
    string Name,
    string Path,
    string RelativePath,
    string Extension,
    string Kind,
    long SizeBytes,
    DateTimeOffset ModifiedUtc);

public sealed record FolderSummary(
    int TotalCount,
    int ImageCount,
    int VideoCount,
    int AudioCount,
    long TotalBytes,
    /// <summary>Archivos multimedia en esta carpeta y todas sus subcarpetas (sin filtros de búsqueda).</summary>
    int TreeTotalCount,
    int TreeImageCount,
    int TreeVideoCount,
    int TreeAudioCount,
    long TreeTotalBytes);

public sealed record FolderQuery(
    string? Kind = null,
    string? Search = null,
    string SortBy = "date",
    bool? Descending = null,
    bool Recursive = false);

public sealed record FolderListing(
    string Path,
    string Name,
    string? ParentPath,
    IReadOnlyList<BreadcrumbEntry> Breadcrumbs,
    IReadOnlyList<FolderEntry> Folders,
    IReadOnlyList<MediaFileEntry> Files,
    FolderSummary Summary);

/// <summary>
/// Lee una carpeta en el momento, sin pasar por el catálogo.
/// Sirve para explorar antes de catalogar, y para el selector de carpetas.
/// Lista un nivel. El aplanado, si se pide, corta en <see cref="MaxEnumeratedFiles"/>.
/// </summary>
public sealed class FolderExplorer
{
    public const int MaxEnumeratedFiles = 25_000;

    /// <summary>Raíz del Explorador de Windows para equipos y recursos compartidos (solo UNC).</summary>
    public const string WindowsNetworkRoot = UncPaths.Root;

    public IReadOnlyList<RootEntry> GetRoots(string? extraRootPath = null)
    {
        var roots = new List<RootEntry>();
        var seen = new HashSet<string>(
            OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal);

        void AddIfExists(string name, string? path, string kind)
        {
            if (string.IsNullOrWhiteSpace(path))
                return;

            try
            {
                var full = Path.GetFullPath(path);
                if (!Directory.Exists(full))
                    return;
                if (seen.Add(full))
                    roots.Add(new RootEntry(name, full, kind));
            }
            catch
            {
                // Ignore inaccessible paths
            }
        }

        AddIfExists("Imágenes", Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "pictures");
        AddIfExists("Videos", Environment.GetFolderPath(Environment.SpecialFolder.MyVideos), "videos");
        AddIfExists("Música", Environment.GetFolderPath(Environment.SpecialFolder.MyMusic), "music");
        AddIfExists("Escritorio", Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "desktop");

        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!string.IsNullOrWhiteSpace(userProfile))
        {
            AddIfExists("Descargas", Path.Combine(userProfile, "Downloads"), "downloads");
            AddIfExists("Carpeta personal", userProfile, "home");
        }

        if (!string.IsNullOrWhiteSpace(extraRootPath))
        {
            AddIfExists(GetDisplayName(extraRootPath), extraRootPath, "folder");
        }

        foreach (var drive in DriveInfo.GetDrives())
        {
            try
            {
                if (!drive.IsReady)
                    continue;

                if (drive.DriveType is DriveType.Fixed or DriveType.Removable or DriveType.Network)
                {
                    var rootPath = drive.RootDirectory.FullName;
                    if (!OperatingSystem.IsWindows() &&
                        (rootPath.StartsWith("/sys", StringComparison.Ordinal) ||
                         rootPath.StartsWith("/proc", StringComparison.Ordinal) ||
                         rootPath.StartsWith("/dev", StringComparison.Ordinal) ||
                         rootPath.StartsWith("/run", StringComparison.Ordinal)))
                    {
                        continue;
                    }

                    var trimmedDrive = drive.Name.TrimEnd('\\', '/');
                    var displayDrive = string.IsNullOrEmpty(trimmedDrive) ? drive.Name : trimmedDrive;
                    var hasDistinctLabel =
                        !string.IsNullOrWhiteSpace(drive.VolumeLabel) &&
                        !string.Equals(drive.VolumeLabel, drive.Name, StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(drive.VolumeLabel, displayDrive, StringComparison.OrdinalIgnoreCase);

                    var label = hasDistinctLabel
                        ? $"{drive.VolumeLabel} ({displayDrive})"
                        : displayDrive;
                    AddIfExists(label, rootPath, "drive");
                }
            }
            catch
            {
                // Ignore drives that fail readiness checks
            }
        }

        if (OperatingSystem.IsWindows() && seen.Add(WindowsNetworkRoot))
            roots.Add(new RootEntry("Red", WindowsNetworkRoot, "network"));

        return roots;
    }

    public FolderListing ListFolder(string folderPath, FolderQuery? query = null)
    {
        if (string.IsNullOrWhiteSpace(folderPath))
            throw new ArgumentException("La ruta de la carpeta es obligatoria.", nameof(folderPath));

        var normalizedPath = NormalizePath(folderPath);
        if (OperatingSystem.IsWindows() && UncPaths.IsUnc(normalizedPath))
        {
            if (UncPaths.IsRoot(normalizedPath))
                return ListNetworkRoot();

            if (UncPaths.Segments(normalizedPath).Count == 1)
                return ListNetworkServer(normalizedPath);
        }

        var dirInfo = new DirectoryInfo(normalizedPath);
        if (!dirInfo.Exists)
        {
            var message = UncPaths.IsUnc(normalizedPath)
                ? $"No se pudo abrir '{normalizedPath}'. Comprobá que el equipo esté disponible y que tengas permiso."
                : $"No existe la carpeta '{normalizedPath}'.";
            throw new DirectoryNotFoundException(message);
        }

        var effectiveQuery = query ?? new FolderQuery();
        if (!MediaTypes.TryParseKindFilter(effectiveQuery.Kind, out var kindFilter))
            throw new ArgumentException($"Tipo de archivo inválido: '{effectiveQuery.Kind}'.", nameof(query));

        var directOptions = new EnumerationOptions
        {
            IgnoreInaccessible = true,
            ReturnSpecialDirectories = false,
            RecurseSubdirectories = false,
            AttributesToSkip = FileAttributes.Hidden | FileAttributes.System
        };

        var folders = new List<FolderEntry>();
        foreach (var subDir in dirInfo.EnumerateDirectories("*", directOptions))
        {
            try
            {
                if (subDir.Name.StartsWith('.'))
                    continue;

                folders.Add(new FolderEntry(
                    subDir.Name,
                    subDir.FullName,
                    new DateTimeOffset(subDir.LastWriteTimeUtc, TimeSpan.Zero)));
            }
            catch
            {
                // Ignore folders that vanish or fail stat during enumeration
            }
        }

        folders.Sort(static (a, b) => StringComparer.OrdinalIgnoreCase.Compare(a.Name, b.Name));

        var fileOptions = new EnumerationOptions
        {
            IgnoreInaccessible = true,
            ReturnSpecialDirectories = false,
            RecurseSubdirectories = effectiveQuery.Recursive,
            MaxRecursionDepth = effectiveQuery.Recursive ? 16 : 0,
            AttributesToSkip = FileAttributes.Hidden | FileAttributes.System
        };

        var searchTokens = SearchText.Tokenize(effectiveQuery.Search);

        var imageCount = 0;
        var videoCount = 0;
        var audioCount = 0;
        long totalBytes = 0;
        var matchedFiles = new List<MediaFileEntry>();
        var inspectedMediaCount = 0;

        foreach (var file in dirInfo.EnumerateFiles("*", fileOptions))
        {
            if (inspectedMediaCount >= MaxEnumeratedFiles)
                break;

            if (file.Name.StartsWith('.'))
                continue;

            if (!MediaTypes.TryGetKind(file.Extension, out var mediaKind))
                continue;

            string relativePath;
            long length;
            DateTimeOffset modifiedUtc;
            try
            {
                relativePath = Path.GetRelativePath(dirInfo.FullName, file.FullName).Replace('\\', '/');
                length = file.Length;
                modifiedUtc = new DateTimeOffset(file.LastWriteTimeUtc, TimeSpan.Zero);
            }
            catch
            {
                continue;
            }

            if (!SearchText.Matches(relativePath, searchTokens))
                continue;

            inspectedMediaCount++;
            totalBytes += length;
            switch (mediaKind)
            {
                case MediaKind.Image:
                    imageCount++;
                    break;
                case MediaKind.Video:
                    videoCount++;
                    break;
                case MediaKind.Audio:
                    audioCount++;
                    break;
            }

            if (kindFilter is not null && mediaKind != kindFilter.Value)
                continue;

            matchedFiles.Add(new MediaFileEntry(
                Name: file.Name,
                Path: file.FullName,
                RelativePath: relativePath,
                Extension: file.Extension.ToLowerInvariant(),
                Kind: mediaKind.ToWireName(),
                SizeBytes: length,
                ModifiedUtc: modifiedUtc));
        }

        SortFiles(matchedFiles, effectiveQuery.SortBy, effectiveQuery.Descending);

        var directTotal = imageCount + videoCount + audioCount;
        FolderSummary treeStats;
        if (UncPaths.IsUnc(normalizedPath))
        {
            // Un recorrido completo por SMB deja colgada la red. El conteo es solo de esta carpeta.
            treeStats = new FolderSummary(
                TotalCount: directTotal,
                ImageCount: imageCount,
                VideoCount: videoCount,
                AudioCount: audioCount,
                TotalBytes: totalBytes,
                TreeTotalCount: directTotal,
                TreeImageCount: imageCount,
                TreeVideoCount: videoCount,
                TreeAudioCount: audioCount,
                TreeTotalBytes: totalBytes);
        }
        else if (effectiveQuery.Recursive)
        {
            treeStats = new FolderSummary(
                TotalCount: directTotal,
                ImageCount: imageCount,
                VideoCount: videoCount,
                AudioCount: audioCount,
                TotalBytes: totalBytes,
                TreeTotalCount: directTotal,
                TreeImageCount: imageCount,
                TreeVideoCount: videoCount,
                TreeAudioCount: audioCount,
                TreeTotalBytes: totalBytes);
        }
        else
        {
            var deep = CountSubtreeMedia(dirInfo);
            treeStats = new FolderSummary(
                TotalCount: directTotal,
                ImageCount: imageCount,
                VideoCount: videoCount,
                AudioCount: audioCount,
                TotalBytes: totalBytes,
                TreeTotalCount: deep.TotalCount,
                TreeImageCount: deep.ImageCount,
                TreeVideoCount: deep.VideoCount,
                TreeAudioCount: deep.AudioCount,
                TreeTotalBytes: deep.TotalBytes);
        }

        string listingPath;
        string? parentPath;
        IReadOnlyList<BreadcrumbEntry> breadcrumbs;
        if (UncPaths.IsUnc(normalizedPath))
        {
            listingPath = UncPaths.Canonical(normalizedPath);
            parentPath = UncPaths.Parent(listingPath);
            breadcrumbs = UncPaths.Breadcrumbs(listingPath);
        }
        else
        {
            listingPath = dirInfo.FullName;
            parentPath = dirInfo.Parent?.FullName;
            breadcrumbs = BuildBreadcrumbs(dirInfo);
        }

        return new FolderListing(
            Path: listingPath,
            Name: GetDisplayName(listingPath),
            ParentPath: parentPath,
            Breadcrumbs: breadcrumbs,
            Folders: folders,
            Files: matchedFiles,
            Summary: treeStats);
    }

    private static (int TotalCount, int ImageCount, int VideoCount, int AudioCount, long TotalBytes) CountSubtreeMedia(DirectoryInfo root)
    {
        var subtreeOptions = new EnumerationOptions
        {
            IgnoreInaccessible = true,
            ReturnSpecialDirectories = false,
            RecurseSubdirectories = true,
            MaxRecursionDepth = 16,
            AttributesToSkip = FileAttributes.Hidden | FileAttributes.System
        };

        var img = 0;
        var vid = 0;
        var aud = 0;
        long bytes = 0;
        var n = 0;

        foreach (var file in root.EnumerateFiles("*", subtreeOptions))
        {
            if (n >= MaxEnumeratedFiles)
                break;

            if (file.Name.StartsWith('.'))
                continue;

            if (!MediaTypes.TryGetKind(file.Extension, out var mediaKind))
                continue;

            long length;
            try
            {
                length = file.Length;
            }
            catch
            {
                continue;
            }

            n++;
            bytes += length;
            switch (mediaKind)
            {
                case MediaKind.Image:
                    img++;
                    break;
                case MediaKind.Video:
                    vid++;
                    break;
                case MediaKind.Audio:
                    aud++;
                    break;
            }
        }

        return (img + vid + aud, img, vid, aud, bytes);
    }

    public static string NormalizePath(string rawPath)
    {
        var trimmed = rawPath.Trim().Trim('"');
        if (string.IsNullOrWhiteSpace(trimmed))
            throw new ArgumentException("La ruta está vacía.", nameof(rawPath));

        if (OperatingSystem.IsWindows() && UncPaths.IsUnc(trimmed))
        {
            if (UncPaths.IsRoot(trimmed))
                return UncPaths.Root;

            trimmed = UncPaths.Canonical(trimmed);
            try
            {
                return Path.GetFullPath(trimmed);
            }
            catch (ArgumentException)
            {
                return trimmed;
            }
        }

        return Path.GetFullPath(trimmed);
    }

    private static readonly FolderSummary EmptySummary = new(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    private static FolderListing ListNetworkRoot() =>
        new(
            Path: UncPaths.Root,
            Name: "Red",
            ParentPath: null,
            Breadcrumbs: UncPaths.Breadcrumbs(UncPaths.Root),
            Folders: WindowsNetworkCatalog.ListComputers(),
            Files: [],
            Summary: EmptySummary);

    private static FolderListing ListNetworkServer(string serverUnc)
    {
        var canonical = UncPaths.Canonical(serverUnc);
        if (!WindowsNetworkCatalog.TryListShares(canonical, out var shares, out var error))
            throw new DirectoryNotFoundException(error ?? $"No se pudo abrir '{canonical}'.");

        return new FolderListing(
            Path: canonical,
            Name: GetDisplayName(canonical),
            ParentPath: UncPaths.Parent(canonical),
            Breadcrumbs: UncPaths.Breadcrumbs(canonical),
            Folders: shares,
            Files: [],
            Summary: EmptySummary);
    }

    private static string GetDisplayName(string fullPath)
    {
        if (UncPaths.IsRoot(fullPath))
            return "Red";

        if (UncPaths.IsUnc(fullPath))
        {
            var segments = UncPaths.Segments(fullPath);
            if (segments.Count > 0)
                return segments[^1];
        }

        var name = Path.GetFileName(Path.TrimEndingDirectorySeparator(fullPath));
        return string.IsNullOrEmpty(name) ? fullPath : name;
    }

    private static IReadOnlyList<BreadcrumbEntry> BuildBreadcrumbs(DirectoryInfo directory)
    {
        var chain = new List<BreadcrumbEntry>();
        var current = directory;
        while (current is not null)
        {
            chain.Add(new BreadcrumbEntry(GetDisplayName(current.FullName), current.FullName));
            current = current.Parent;
        }

        chain.Reverse();
        return chain;
    }

    private static void SortFiles(List<MediaFileEntry> files, string? sortBy, bool? descendingOverride)
    {
        var mode = string.IsNullOrWhiteSpace(sortBy) ? "date" : sortBy.Trim().ToLowerInvariant();
        var descending = descendingOverride ?? mode is "date" or "size";

        Comparison<MediaFileEntry> comparison = mode switch
        {
            "name" => static (a, b) => StringComparer.OrdinalIgnoreCase.Compare(a.Name, b.Name),
            "size" => static (a, b) =>
            {
                var cmp = a.SizeBytes.CompareTo(b.SizeBytes);
                return cmp != 0 ? cmp : StringComparer.OrdinalIgnoreCase.Compare(a.Name, b.Name);
            },
            "type" => static (a, b) =>
            {
                var cmp = StringComparer.OrdinalIgnoreCase.Compare(a.Extension, b.Extension);
                return cmp != 0 ? cmp : StringComparer.OrdinalIgnoreCase.Compare(a.Name, b.Name);
            },
            _ => static (a, b) =>
            {
                var cmp = a.ModifiedUtc.CompareTo(b.ModifiedUtc);
                return cmp != 0 ? cmp : StringComparer.OrdinalIgnoreCase.Compare(a.Name, b.Name);
            }
        };

        files.Sort(descending ? (a, b) => comparison(b, a) : comparison);
    }
}
