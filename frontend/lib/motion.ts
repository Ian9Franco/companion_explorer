import type { Transition, Variants } from "motion/react";

export const ease = [0.22, 1, 0.36, 1] as const;

export const spring: Transition = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 };

export const softSpring: Transition = { type: "spring", stiffness: 260, damping: 30 };

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22, ease } },
  exit: { opacity: 0, transition: { duration: 0.16, ease } }
};

export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.16, ease } }
};

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
