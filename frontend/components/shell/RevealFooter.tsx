"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { panelSpring } from "../../lib/motion";

function IconGitHub({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.35-1.76-1.35-1.76-1.1-.75.08-.74.08-.74 1.22.09 1.86 1.25 1.86 1.25 1.08 1.84 2.83 1.31 3.52 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.48-1.33-5.48-5.92 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02.01 2.04.14 3 .4 2.29-1.55 3.29-1.23 3.29-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.6-2.82 5.61-5.5 5.9.43.37.81 1.1.81 2.22 0 1.61-.01 2.91-.01 3.31 0 .32.21.7.83.58A12.01 12.01 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

function IconLinkedIn({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.65-1.85 3.4-1.85 3.64 0 4.31 2.39 4.31 5.5v6.24ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.23 0 22.22 0Z" />
    </svg>
  );
}

const AUTHOR_WEB = "https://ian-pontorno-portfolio.vercel.app/";
const AUTHOR_LINKEDIN = "https://www.linkedin.com/in/ian-franco-collada-pontorno";
const AUTHOR_GITHUB = "https://github.com/Ian9Franco";
const REPO = "https://github.com/Ian9Franco/companion_explorer";
const LICENSE = "https://github.com/Ian9Franco/companion_explorer/blob/main/LICENSE";

const NAV_LINKS = [
  { label: "LinkedIn", href: AUTHOR_LINKEDIN, Icon: IconLinkedIn },
  { label: "Repositorio", href: REPO },
  { label: "Licencia MIT", href: LICENSE }
] as const;

/**
 * Pie oculto. Una franja en el borde inferior lo trae desde la derecha
 * hasta su lugar; al salir el cursor, se guarda otra vez.
 */
export function RevealFooter() {
  const [open, setOpen] = useState(false);

  return (
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
        </div>

        <nav className="reveal-footer-links" aria-label="Enlaces">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="reveal-footer-link">
              {"Icon" in link && link.Icon ? <link.Icon size={14} /> : null}
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
  );
}