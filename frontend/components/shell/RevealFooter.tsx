"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { panelSpring } from "../../lib/motion";

const LINKS = [
  { label: "LinkedIn", href: "https://www.linkedin.com/in/ian-franco-collada-pontorno/" },
  { label: "GitHub", href: "https://github.com/Ian9Franco" },
  { label: "Web", href: "https://ian-pontorno-portfolio.vercel.app/" },
  { label: "Repositorio", href: "https://github.com/Ian9Franco/companion_explorer" },
  { label: "Licencia MIT", href: "https://github.com/Ian9Franco/companion_explorer/blob/main/LICENSE" }
];

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
        <p className="reveal-footer-id">
          <span>Ian Franco Collada Pontorno</span>
          <span>Companion Explorer</span>
          <span>© 2026 Notorious</span>
        </p>
        <nav className="reveal-footer-links" aria-label="Enlaces">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
              {link.label}
            </a>
          ))}
        </nav>
      </motion.footer>
    </div>
  );
}
