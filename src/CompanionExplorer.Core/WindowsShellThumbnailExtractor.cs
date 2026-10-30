using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using SkiaSharp;

namespace CompanionExplorer.Core;

[SupportedOSPlatform("windows")]
public static class WindowsShellThumbnailExtractor
{
    private static readonly Guid ShellItemImageFactoryGuid = new("bcc18b79-ba16-442f-80c4-8a59c30c463b");

    public static bool TryExtractJpeg(string fullPath, int size, out byte[] jpegBytes)
    {
        jpegBytes = [];
        if (!OperatingSystem.IsWindows())
            return false;

        var hr = SHCreateItemFromParsingName(fullPath, IntPtr.Zero, ShellItemImageFactoryGuid, out var factory);
        if (hr != 0 || factory is null)
            return false;

        IntPtr hBitmap = IntPtr.Zero;
        try
        {
            var requestedSize = new SIZE { cx = size, cy = size };
            hr = factory.GetImage(requestedSize, SIIGBF.SIIGBF_BIGGERSIZEOK | SIIGBF.SIIGBF_THUMBNAILONLY, out hBitmap);
            if (hr != 0 || hBitmap == IntPtr.Zero)
            {
                hr = factory.GetImage(requestedSize, SIIGBF.SIIGBF_RESIZETOFIT, out hBitmap);
            }

            if (hr != 0 || hBitmap == IntPtr.Zero)
                return false;

            if (GetObject(hBitmap, Marshal.SizeOf<BITMAP>(), out var bmp) == 0 || bmp.bmWidth <= 0 || bmp.bmHeight <= 0)
                return false;

            var width = bmp.bmWidth;
            var height = Math.Abs(bmp.bmHeight);
            var pixelBytes = new byte[width * height * 4];

            var bmi = new BITMAPINFO
            {
                bmiHeader = new BITMAPINFOHEADER
                {
                    biSize = (uint)Marshal.SizeOf<BITMAPINFOHEADER>(),
                    biWidth = width,
                    biHeight = -height, // top-down DIB
                    biPlanes = 1,
                    biBitCount = 32,
                    biCompression = 0 // BI_RGB
                }
            };

            var screenDc = GetDC(IntPtr.Zero);
            try
            {
                var lines = GetDIBits(screenDc, hBitmap, 0, (uint)height, pixelBytes, ref bmi, 0);
                if (lines == 0)
                    return false;
            }
            finally
            {
                if (screenDc != IntPtr.Zero)
                    ReleaseDC(IntPtr.Zero, screenDc);
            }

            var info = new SKImageInfo(width, height, SKColorType.Bgra8888, SKAlphaType.Premul);
            using var bitmap = new SKBitmap(info);
            Marshal.Copy(pixelBytes, 0, bitmap.GetPixels(), pixelBytes.Length);
            using var image = SKImage.FromBitmap(bitmap);
            using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, 82);
            if (encoded is null)
                return false;

            jpegBytes = encoded.ToArray();
            return jpegBytes.Length > 0;
        }
        catch
        {
            return false;
        }
        finally
        {
            if (hBitmap != IntPtr.Zero)
                DeleteObject(hBitmap);
            if (Marshal.IsComObject(factory))
                Marshal.ReleaseComObject(factory);
        }
    }

    [Flags]
    private enum SIIGBF
    {
        SIIGBF_RESIZETOFIT = 0x00,
        SIIGBF_BIGGERSIZEOK = 0x01,
        SIIGBF_MEMORYONLY = 0x02,
        SIIGBF_ICONONLY = 0x04,
        SIIGBF_THUMBNAILONLY = 0x08,
        SIIGBF_INCACHEONLY = 0x10
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SIZE
    {
        public int cx;
        public int cy;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BITMAP
    {
        public int bmType;
        public int bmWidth;
        public int bmHeight;
        public int bmWidthBytes;
        public ushort bmPlanes;
        public ushort bmBitsPixel;
        public IntPtr bmBits;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BITMAPINFOHEADER
    {
        public uint biSize;
        public int biWidth;
        public int biHeight;
        public ushort biPlanes;
        public ushort biBitCount;
        public uint biCompression;
        public uint biSizeImage;
        public int biXPelsPerMeter;
        public int biYPelsPerMeter;
        public uint biClrUsed;
        public uint biClrImportant;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BITMAPINFO
    {
        public BITMAPINFOHEADER bmiHeader;
        public uint bmiColors;
    }

    [ComImport]
    [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItemImageFactory
    {
        [PreserveSig]
        int GetImage([In, MarshalAs(UnmanagedType.Struct)] SIZE size, [In] SIIGBF flags, out IntPtr phbm);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    private static extern int SHCreateItemFromParsingName(
        [In, MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        [In] IntPtr pbc,
        [In, MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        [Out, MarshalAs(UnmanagedType.Interface, IidParameterIndex = 2)] out IShellItemImageFactory? ppv);

    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern int GetObject(IntPtr hObject, int nCount, out BITMAP lpObject);

    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern int GetDIBits(
        IntPtr hdc,
        IntPtr hbmp,
        uint uStartScan,
        uint cScanLines,
        [Out] byte[] lpvBits,
        ref BITMAPINFO lpbi,
        uint uUsage);

    [DllImport("gdi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeleteObject(IntPtr hObject);

    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
}
