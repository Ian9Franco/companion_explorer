using System.Globalization;
using System.Text;

namespace CompanionExplorer.Core;

/// <summary>
/// Search matches lowercase text without diacritics, so "musica" finds "Música".
/// </summary>
public static class SearchText
{
    public static string Normalize(string value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        var decomposed = value.Replace('\\', '/').ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                builder.Append(c);
        }

        return builder.ToString().Normalize(NormalizationForm.FormC);
    }

    public static string[] Tokenize(string? search)
    {
        if (string.IsNullOrWhiteSpace(search))
            return [];

        return Normalize(search)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    public static bool Matches(string haystack, string[] normalizedTokens)
    {
        if (normalizedTokens.Length == 0)
            return true;

        var normalized = Normalize(haystack);
        foreach (var token in normalizedTokens)
        {
            if (!normalized.Contains(token, StringComparison.Ordinal))
                return false;
        }

        return true;
    }
}
