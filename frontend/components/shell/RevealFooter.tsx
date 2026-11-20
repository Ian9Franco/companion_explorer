"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { AppUpdateInfo } from "../../lib/api";
import { panelSpring } from "../../lib/motion";

function IconGitHub({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.35-1.76-1.35-1.76-1.1-.75.08-.74.08-.74 1.22.09 1.86 1.25 1.86 1.25 1.08 1.84 2.83 1.31 3.52 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.48-1.33-5.48-5.92 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02.01 2.04.14 3 .4 2.29-1.55 3.29-1.23 3.29-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.6-2.82 5.61-5.5 5.9.43.37.81 1.1.81 2.22 0 1.61-.01 2.91-.01 3.31 0 .32.21.7.83.58A12.01 12.01 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

const AUTHOR_WEB = "https://ian-pontorno-portfolio.vercel.app/";
const AUTHOR_GITHUB = "https://github.com/Ian9Franco";
const REPO = "https://github.com/Ian9Franco/companion_explorer";
const LICENSE = "https://github.com/Ian9Franco/companion_explorer/blob/main/LICENSE";

const NAV_LINKS = [
  { label: "Repositorio", href: REPO },
  { label: "Licencia MIT", href: LICENSE }
] as const;

type RevealFooterProps = {
  version: string | null;
  update: AppUpdateInfo | null;
  updating: boolean;
  onUpdate: () => void;
};

function versionLabel(version: string | null): string | null {
  if (!version) return null;
  const trimmed = version.trim().replace(/^[vV]/, "");
  return trimmed ? `v${trimmed}` : null;
}

/**
 * Pie oculto. Una franja en el borde inferior lo trae desde la derecha
 * hasta su lugar; al salir el cursor, se guarda otra vez.
 * Si hay una versión nueva, el badge queda visible con la app abierta.
 */
export function RevealFooter({ version, update, updating, onUpdate }: RevealFooterProps) {
  const [open, setOpen] = useState(false);
  const installed = versionLabel(version);
  const latest = versionLabel(update?.latest ?? null);
  const available = Boolean(update?.updateAvailable && latest);

  return (
    <>
    {available && !open ? (
      <button type="button" className="update-badge" onClick={onUpdate} disabled={updating} aria-live="polite">
        <span className="update-badge-dot" aria-hidden />
        {updating ? "Descargando…" : `Actualización ${latest}`}
      </button>
    ) : null}
    <div
      className={`footer-dock ${open ? "is-open" : ""}`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={(event) => {
        if (event.currentTarget.contains(document.activeElement)) return;
        setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
      }}
    >
      <motion.footer
        className="reveal-footer"
        aria-label="Información del proyecto"
        initial={false}
        animate={{ x: open ? "0%" : "100%" }}
        transition={panelSpring}
      >
        <div className="reveal-footer-main">
          <a
            className="reveal-footer-name"
            href={AUTHOR_WEB}
            target="_blank"
            rel="noreferrer"
            title="Portfolio de Ian Pontorno"
          >
            Ian Franco Collada Pontorno
          </a>
          <span className="reveal-footer-dot" aria-hidden />
          <span className="reveal-footer-app">Companion Explorer</span>
          {installed ? (
            <span className="reveal-footer-version" title="Versión instalada">
              {installed}
            </span>
          ) : null}
        </div>

        <nav className="reveal-footer-links" aria-label="Enlaces">
          {available ? (
            <button type="button" className="update-badge is-inline" onClick={onUpdate} disabled={updating}>
              <span className="update-badge-dot" aria-hidden />
              {updating ? "Descargando…" : `Actualizar a ${latest}`}
            </button>
          ) : null}
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="reveal-footer-link">
              <span>{link.label}</span>
            </a>
          ))}
        </nav>

        <a
          className="reveal-footer-github"
          href={AUTHOR_GITHUB}
          target="_blank"
          rel="noreferrer"
          title="GitHub — Ian9Franco"
        >
          <IconGitHub size={15} />
          <span>© 2026 Ian9Franco</span>
        </a>
      </motion.footer>
    </div>
    </>
  );
}
