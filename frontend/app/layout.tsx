import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Companion Explorer",
  description: "Explorador de archivos locales"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
