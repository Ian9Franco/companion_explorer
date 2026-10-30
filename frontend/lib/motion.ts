import type { Transition, Variants } from "motion/react";

/** Curvas compartidas. Cada componente declara su propia animación con estas dos. */
export const ease = [0.22, 1, 0.36, 1] as const;

export const spring: Transition = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 };

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
