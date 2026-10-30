namespace CompanionExplorer.Core;

public enum MediaKind
{
    Image,
    Video,
    Audio
}

public static class MediaTypes
{
    private static readonly Dictionary<string, (MediaKind Kind, string ContentType)> ExtensionMap =
        new(StringComparer.OrdinalIgnoreCase)
        {
            // Images
            [".jpg"] = (MediaKind.Image, "image/jpeg"),
            [".jpeg"] = (MediaKind.Image, "image/jpeg"),
            [".png"] = (MediaKind.Image, "image/png"),
            [".webp"] = (MediaKind.Image, "image/webp"),
            [".gif"] = (MediaKind.Image, "image/gif"),
            [".bmp"] = (MediaKind.Image, "image/bmp"),
            [".svg"] = (MediaKind.Image, "image/svg+xml"),
            [".avif"] = (MediaKind.Image, "image/avif"),
            [".tif"] = (MediaKind.Image, "image/tiff"),
            [".tiff"] = (MediaKind.Image, "image/tiff"),
            [".ico"] = (MediaKind.Image, "image/x-icon"),

            // Videos
            [".mp4"] = (MediaKind.Video, "video/mp4"),
            [".m4v"] = (MediaKind.Video, "video/mp4"),
            [".webm"] = (MediaKind.Video, "video/webm"),
            [".mov"] = (MediaKind.Video, "video/quicktime"),
            [".mkv"] = (MediaKind.Video, "video/x-matroska"),
            [".avi"] = (MediaKind.Video, "video/x-msvideo"),

            // Audio
            [".mp3"] = (MediaKind.Audio, "audio/mpeg"),
            [".wav"] = (MediaKind.Audio, "audio/wav"),
            [".flac"] = (MediaKind.Audio, "audio/flac"),
            [".ogg"] = (MediaKind.Audio, "audio/ogg"),
            [".m4a"] = (MediaKind.Audio, "audio/mp4"),
            [".aac"] = (MediaKind.Audio, "audio/aac"),
            [".opus"] = (MediaKind.Audio, "audio/opus")
        };

    public static bool TryGetKind(string pathOrExtension, out MediaKind kind)
    {
        var ext = NormalizeExtension(pathOrExtension);
        if (ExtensionMap.TryGetValue(ext, out var entry))
        {
            kind = entry.Kind;
            return true;
        }

        kind = default;
        return false;
    }

    public static string GetContentType(string pathOrExtension)
    {
        var ext = NormalizeExtension(pathOrExtension);
        return ExtensionMap.TryGetValue(ext, out var entry)
            ? entry.ContentType
            : "application/octet-stream";
    }

    public static string ToWireName(this MediaKind kind) => kind switch
    {
        MediaKind.Image => "image",
        MediaKind.Video => "video",
        MediaKind.Audio => "audio",
        _ => "image"
    };

    public static bool TryParseKindFilter(string? value, out MediaKind? filter)
    {
        if (string.IsNullOrWhiteSpace(value) || string.Equals(value, "all", StringComparison.OrdinalIgnoreCase))
        {
            filter = null;
            return true;
        }

        switch (value.Trim().ToLowerInvariant())
        {
            case "image":
            case "images":
            case "imagen":
            case "imagenes":
                filter = MediaKind.Image;
                return true;
            case "video":
            case "videos":
                filter = MediaKind.Video;
                return true;
            case "audio":
            case "audios":
                filter = MediaKind.Audio;
                return true;
            default:
                filter = null;
                return false;
        }
    }

    private static string NormalizeExtension(string pathOrExtension)
    {
        if (string.IsNullOrWhiteSpace(pathOrExtension))
            return string.Empty;

        var trimmed = pathOrExtension.Trim();
        if (trimmed.StartsWith('.') && !trimmed.AsSpan(1).Contains('.') && !trimmed.Contains('/') && !trimmed.Contains('\\'))
            return trimmed;

        return Path.GetExtension(trimmed);
    }
}
