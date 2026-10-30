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
    long TotalBytes);

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

public sealed class FolderExplorer
{
    public const int MaxEnumeratedFiles = 25_000;

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

        return roots;
    }

    public FolderListing ListFolder(string folderPath, FolderQuery? query = null)
    {
        if (string.IsNullOrWhiteSpace(folderPath))
            throw new ArgumentException("La ruta de la carpeta es obligatoria.", nameof(folderPath));

        var normalizedPath = NormalizePath(folderPath);
        var dirInfo = new DirectoryInfo(normalizedPath);
        if (!dirInfo.Exists)
            throw new DirectoryNotFoundException($"No existe la carpeta '{normalizedPath}'.");

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

        var summary = new FolderSummary(
            TotalCount: imageCount + videoCount + audioCount,
            ImageCount: imageCount,
            VideoCount: videoCount,
            AudioCount: audioCount,
            TotalBytes: totalBytes);

        var parentPath = dirInfo.Parent?.FullName;
        var breadcrumbs = BuildBreadcrumbs(dirInfo);

        return new FolderListing(
            Path: dirInfo.FullName,
            Name: GetDisplayName(dirInfo.FullName),
            ParentPath: parentPath,
            Breadcrumbs: breadcrumbs,
            Folders: folders,
            Files: matchedFiles,
            Summary: summary);
    }

    public static string NormalizePath(string rawPath)
    {
        var trimmed = rawPath.Trim().Trim('"');
        return Path.GetFullPath(trimmed);
    }

    private static string GetDisplayName(string fullPath)
    {
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
