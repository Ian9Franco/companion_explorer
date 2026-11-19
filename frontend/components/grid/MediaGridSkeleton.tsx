"use client";

import { motion } from "motion/react";
import { Density, FolderLayout } from "./MediaGrid";
import { skeletonShimmer, skeletonTile, stagger } from "../../lib/motion";

const DENSITY_MIN: Record<Density, number> = {
  compact: 150,
  medium: 210,
  large: 290
};

type MediaGridSkeletonProps = {
  density?: Density;
  viewMode?: FolderLayout;
  count?: number;
};

export function MediaGridSkeleton({ density = "medium", viewMode = "grid", count = 20 }: MediaGridSkeletonProps) {
  if (viewMode === "list") {
    return (
      <motion.div
        className="stage-fill skeleton-list"
        variants={stagger(0.045, 0.06)}
        initial="hidden"
        animate="visible"
        aria-busy="true"
        aria-label="Cargando archivos"
      >
        {Array.from({ length: Math.min(count, 14) }, (_, i) => (
          <motion.div key={i} className="media-row skeleton skeleton-rich" variants={skeletonTile} custom={i}>
            <span className="skeleton-block skeleton-thumb is-round" />
            <span className="skeleton-copy">
              <span className="skeleton-block skeleton-line is-wide" />
              <span className="skeleton-block skeleton-line" />
            </span>
            <motion.span className="skeleton-sheen" variants={skeletonShimmer} animate="visible" />
          </motion.div>
        ))}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="stage-fill skeleton-grid skeleton-grid-rich"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${DENSITY_MIN[density]}px, 1fr))` }}
      variants={stagger(0.03, 0.08)}
      initial="hidden"
      animate="visible"
      aria-busy="true"
      aria-label="Cargando archivos"
    >
      {Array.from({ length: count }, (_, i) => (
        <motion.article key={i} className="media-card skeleton skeleton-rich" variants={skeletonTile} custom={i}>
          <span className="skeleton-block skeleton-thumb" />
          <span className="skeleton-meta">
            <span className="skeleton-block skeleton-line is-wide" />
            <span className="skeleton-block skeleton-line" />
          </span>
          <motion.span className="skeleton-sheen" variants={skeletonShimmer} animate="visible" />
        </motion.article>
      ))}
    </motion.div>
  );
}