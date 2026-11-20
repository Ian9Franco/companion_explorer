using System.Runtime.InteropServices;

namespace CompanionExplorer.Core;

/// <summary>
/// Equipos y recursos compartidos de Windows. <c>\\</c> no es una carpeta del disco.
/// </summary>
internal static class WindowsNetworkCatalog
{
    private const int ResourceGlobalNet = 2;
    private const int ResourceTypeAny = 0;
    private const int ResourceDisplayTypeServer = 2;
    private const int ResourceDisplayTypeShare = 3;
    private const int ResourceUsageContainer = 0x00000002;
    private const int ErrorMoreData = 234;
    private const uint ServerTypeAll = 0xFFFFFFFF;
    private const uint ShareTypeDisk = 0;
    private const uint ShareTypeSpecial = 0x80000000;

    public static IReadOnlyList<FolderEntry> ListComputers()
    {
        var names = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            CollectServers(null, names, 0);
        }
        catch
        {
            // La red puede no responder; el usuario igual puede pegar una ruta UNC.
        }

        try
        {
            CollectServersFromBrowser(names);
        }
        catch
        {
            // El servicio Examinador de equipos está apagado en Windows recientes.
        }

        return names
            .Select(name => new FolderEntry(name, UncPaths.Join([name]), DateTimeOffset.UtcNow))
            .ToList();
    }

    public static bool TryListShares(string serverUnc, out IReadOnlyList<FolderEntry> shares, out string? error)
    {
        shares = [];
        error = null;
        var server = UncPaths.Segments(serverUnc).FirstOrDefault();
        if (string.IsNullOrWhiteSpace(server))
        {
            error = "Falta el nombre del equipo.";
            return false;
        }

        var found = new List<FolderEntry>();
        if (TryNetShareEnum(server, found))
        {
            shares = found;
            return true;
        }

        try
        {
            foreach (var dir in Directory.EnumerateDirectories(UncPaths.Join([server])))
            {
                var name = Path.GetFileName(dir.TrimEnd('\\'));
                if (string.IsNullOrWhiteSpace(name) || name.EndsWith('$'))
                    continue;

                found.Add(new FolderEntry(name, UncPaths.Join([server, name]), DateTimeOffset.UtcNow));
            }

            shares = found
                .OrderBy(s => s.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            error = $"No se pudo abrir \\\\{server}. Comprobá que esté encendido y que tengas acceso. {ex.Message}";
            return false;
        }
    }

    private static void CollectServers(NetResource? container, SortedSet<string> names, int depth)
    {
        if (depth > 4)
            return;

        foreach (var item in Enumerate(container))
        {
            if (item.DisplayType == ResourceDisplayTypeServer)
            {
                var name = ServerName(item.RemoteName);
                if (!string.IsNullOrWhiteSpace(name))
                    names.Add(name);
                continue;
            }

            if (item.DisplayType == ResourceDisplayTypeShare)
                continue;

            if ((item.Usage & ResourceUsageContainer) != 0 && !string.IsNullOrWhiteSpace(item.RemoteName))
            {
                CollectServers(new NetResource
                {
                    Scope = item.Scope,
                    Type = item.Type,
                    DisplayType = item.DisplayType,
                    Usage = item.Usage,
                    RemoteName = item.RemoteName,
                    Provider = item.Provider
                }, names, depth + 1);
            }
        }
    }

    private static List<NetResourceSnapshot> Enumerate(NetResource? container)
    {
        var items = new List<NetResourceSnapshot>();
        var result = WNetOpenEnum(ResourceGlobalNet, ResourceTypeAny, 0, container, out var handle);
        if (result != 0)
            return items;

        const int bufferSize = 64 * 1024;
        var buffer = Marshal.AllocHGlobal(bufferSize);
        try
        {
            while (true)
            {
                var count = -1;
                var size = bufferSize;
                result = WNetEnumResource(handle, ref count, buffer, ref size);
                if (result != 0 && result != ErrorMoreData)
                    break;
                if (count <= 0)
                    break;

                var stride = Marshal.SizeOf<NetResourceNative>();
                for (var i = 0; i < count; i++)
                {
                    var native = Marshal.PtrToStructure<NetResourceNative>(IntPtr.Add(buffer, i * stride));
                    items.Add(new NetResourceSnapshot(
                        native.Scope,
                        native.Type,
                        native.DisplayType,
                        native.Usage,
                        Read(native.RemoteName),
                        Read(native.Provider)));
                }

                if (result != ErrorMoreData)
                    break;
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
            WNetCloseEnum(handle);
        }

        return items;
    }

    private static void CollectServersFromBrowser(SortedSet<string> names)
    {
        var resume = 0;
        var code = NetServerEnum(
            null,
            101,
            out var buffer,
            -1,
            out var read,
            out _,
            ServerTypeAll,
            null,
            ref resume);

        if (buffer == IntPtr.Zero || (code != 0 && code != ErrorMoreData))
        {
            if (buffer != IntPtr.Zero)
                NetApiBufferFree(buffer);
            return;
        }

        try
        {
            var stride = Marshal.SizeOf<ServerInfo101>();
            for (var i = 0; i < read; i++)
            {
                var info = Marshal.PtrToStructure<ServerInfo101>(IntPtr.Add(buffer, i * stride));
                var name = Read(info.Name);
                if (!string.IsNullOrWhiteSpace(name))
                    names.Add(name);
            }
        }
        finally
        {
            NetApiBufferFree(buffer);
        }
    }

    private static bool TryNetShareEnum(string server, List<FolderEntry> found)
    {
        var resume = 0;
        var code = NetShareEnum(
            @"\\" + server,
            1,
            out var buffer,
            -1,
            out var read,
            out _,
            ref resume);

        if (buffer == IntPtr.Zero || (code != 0 && code != ErrorMoreData))
        {
            if (buffer != IntPtr.Zero)
                NetApiBufferFree(buffer);
            return false;
        }

        try
        {
            var stride = Marshal.SizeOf<ShareInfo1>();
            for (var i = 0; i < read; i++)
            {
                var info = Marshal.PtrToStructure<ShareInfo1>(IntPtr.Add(buffer, i * stride));
                var name = Read(info.NetName);
                if (string.IsNullOrWhiteSpace(name) || name.EndsWith('$'))
                    continue;

                var kind = info.Type & 0xFFFF;
                if (kind != ShareTypeDisk || (info.Type & ShareTypeSpecial) != 0)
                    continue;

                found.Add(new FolderEntry(name, UncPaths.Join([server, name]), DateTimeOffset.UtcNow));
            }
        }
        finally
        {
            NetApiBufferFree(buffer);
        }

        found.Sort(static (a, b) => StringComparer.OrdinalIgnoreCase.Compare(a.Name, b.Name));
        return true;
    }

    private static string? ServerName(string? remote)
    {
        if (string.IsNullOrWhiteSpace(remote))
            return null;

        var segments = UncPaths.Segments(remote.StartsWith(@"\\", StringComparison.Ordinal) ? remote : @"\\" + remote);
        return segments.Count == 0 ? null : segments[0];
    }

    private static string? Read(IntPtr pointer) =>
        pointer == IntPtr.Zero ? null : Marshal.PtrToStringUni(pointer);

    private readonly record struct NetResourceSnapshot(
        int Scope,
        int Type,
        int DisplayType,
        int Usage,
        string? RemoteName,
        string? Provider);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private sealed class NetResource
    {
        public int Scope;
        public int Type;
        public int DisplayType;
        public int Usage;
        public string? LocalName;
        public string? RemoteName;
        public string? Comment;
        public string? Provider;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NetResourceNative
    {
        public int Scope;
        public int Type;
        public int DisplayType;
        public int Usage;
        public IntPtr LocalName;
        public IntPtr RemoteName;
        public IntPtr Comment;
        public IntPtr Provider;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ShareInfo1
    {
        public IntPtr NetName;
        public uint Type;
        public IntPtr Remark;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ServerInfo101
    {
        public int PlatformId;
        public IntPtr Name;
        public int VersionMajor;
        public int VersionMinor;
        public int Type;
        public IntPtr Comment;
    }

    [DllImport("mpr.dll", CharSet = CharSet.Unicode)]
    private static extern int WNetOpenEnum(int scope, int type, int usage, NetResource? resource, out IntPtr handle);

    [DllImport("mpr.dll", CharSet = CharSet.Unicode)]
    private static extern int WNetEnumResource(IntPtr handle, ref int count, IntPtr buffer, ref int bufferSize);

    [DllImport("mpr.dll")]
    private static extern int WNetCloseEnum(IntPtr handle);

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetServerEnum(
        string? serverName,
        int level,
        out IntPtr buffer,
        int prefMaxLen,
        out int entriesRead,
        out int totalEntries,
        uint serverType,
        string? domain,
        ref int resumeHandle);

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetShareEnum(
        string serverName,
        int level,
        out IntPtr buffer,
        int prefMaxLen,
        out int entriesRead,
        out int totalEntries,
        ref int resumeHandle);

    [DllImport("netapi32.dll")]
    private static extern int NetApiBufferFree(IntPtr buffer);
}
