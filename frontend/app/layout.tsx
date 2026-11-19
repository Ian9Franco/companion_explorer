import type { Metadata } from "next";
import { poppins } from "../lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Companion Explorer",
  description: "Explorador de archivos locales"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={poppins.variable}>
      <body className={poppins.className}>{children}</body>
    </html>
  );
}
