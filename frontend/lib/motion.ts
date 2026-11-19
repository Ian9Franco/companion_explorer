import type { Transition, Variants } from "motion/react";

/** Curvas compartidas. Cada componente declara su propia animación con estas dos. */
export const ease = [0.22, 1, 0.36, 1] as const;

export const spring: Transition = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 };

export const panelSpring: Transition = { type: "spring", stiffness: 360, damping: 32, mass: 1.05 };

export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease } },
  exit: { opacity: 0, y: 10, transition: { duration: 0.18, ease } }
};

export const stagger = (step = 0.05, delay = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: step, delayChildren: delay } },
  exit: { transition: { staggerChildren: step / 2, staggerDirection: -1 } }
});

/** Panel que se despliega en altura con un poco de desenfoque. */
export const unfold: Variants = {
  hidden: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    filter: "blur(8px)",
    clipPath: "inset(0 0 100% 0 round 12px)"
  },
  visible: {
    opacity: 1,
    height: "auto",
    marginTop: 12,
    filter: "blur(0px)",
    clipPath: "inset(0 0 0% 0 round 12px)",
    transition: {
      height: panelSpring,
      opacity: { duration: 0.28, ease },
      filter: { duration: 0.35, ease },
      clipPath: { duration: 0.42, ease },
      marginTop: { duration: 0.32, ease }
    }
  },
  exit: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    filter: "blur(6px)",
    clipPath: "inset(0 0 100% 0 round 12px)",
    transition: { duration: 0.22, ease }
  }
};

/** Ítems que entran desde la izquierda al expandir el sidebar. */
export const collapseLane: Variants = {
  hidden: { opacity: 0, x: -14, scale: 0.96, filter: "blur(5px)" },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.34, ease }
  },
  exit: {
    opacity: 0,
    x: -10,
    scale: 0.98,
    filter: "blur(4px)",
    transition: { duration: 0.16, ease }
  }
};

/** Tarjetas del preloader de la grilla. */
export const skeletonTile: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.9, rotate: -1.2 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    rotate: 0,
    transition: {
      delay: Math.min(index, 24) * 0.04,
      duration: 0.5,
      ease,
      scale: { type: "spring", stiffness: 320, damping: 26 }
    }
  })
};

export const skeletonShimmer: Variants = {
  hidden: { opacity: 0.55 },
  visible: {
    opacity: [0.55, 0.95, 0.55],
    transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
  }
};