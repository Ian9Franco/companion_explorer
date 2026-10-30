"use client";

import { useEffect, useState } from "react";

type Brand = {
  id: string;
  productName: string;
  windowTitle: string;
  preloadTitle: string;
  logoUrl: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:5080";

export default function Preload() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/brand`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<Brand>;
      })
      .then((data) => {
        if (!active) return;
        setBrand(data);
        document.title = data.windowTitle;
      })
      .catch(() => {
        if (active) setError("No llega el núcleo. Levantá CompanionExplorer.Api en el puerto 5080.");
      });
    return () => {
      active = false;
    };
  }, []);

  const title = brand?.preloadTitle ?? "Companion";
  const logo = brand ? `${apiUrl}${brand.logoUrl}` : null;

  return (
    <main>
      {logo ? <img src={logo} alt="" /> : null}
      <h1>{title}</h1>
      <p>
        {error ??
          (brand
            ? `${brand.productName}. El explorador empieza cuando elijas una carpeta.`
            : "Conectando con el núcleo…")}
      </p>
    </main>
  );
}
