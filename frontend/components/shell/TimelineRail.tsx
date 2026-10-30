"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { DateRange, TimelineBucket } from "../../lib/api";
import { formatCount, monthRange, monthShortName, yearRange } from "../../lib/format";
import { ease, spring } from "../../lib/motion";

type TimelineRailProps = {
  timeline: TimelineBucket[] | null;
  range: DateRange | null;
  onRange: (range: DateRange | null) => void;
};

type YearGroup = { year: number; total: number; months: TimelineBucket[] };

export function TimelineRail({ timeline, range, onRange }: TimelineRailProps) {
  const { years, max } = useMemo(() => {
    const groups = new Map<number, YearGroup>();
    let peak = 1;
    for (const bucket of timeline ?? []) {
      const group = groups.get(bucket.year) ?? { year: bucket.year, total: 0, months: [] };
      group.total += bucket.count;
      group.months.push(bucket);
      groups.set(bucket.year, group);
      peak = Math.max(peak, bucket.count);
    }
    const ordered = [...groups.values()].sort((a, b) => b.year - a.year);
    for (const group of ordered) group.months.sort((a, b) => b.month - a.month);
    return { years: ordered, max: peak };
  }, [timeline]);

  const isRange = (candidate: { from: number; to: number }) =>
    range !== null && range.from === candidate.from && range.to === candidate.to;

  return (
    <motion.aside
      className="timeline"
      aria-label="Línea de tiempo"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 212, opacity: 1, transition: { ...spring, opacity: { duration: 0.2 } } }}
      exit={{ width: 0, opacity: 0, transition: { duration: 0.22, ease } }}
    >
      <div className="timeline-inner">
        <div className="timeline-head">
          <span>Línea de tiempo</span>
          <AnimatePresence>
            {range ? (
              <motion.button
                type="button"
                className="text-button"
                onClick={() => onRange(null)}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
              >
                <X size={12} /> Quitar
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="timeline-scroll">
          {timeline === null ? (
            <div className="timeline-skeleton">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} style={{ width: `${40 + ((i * 37) % 55)}%` }} />
              ))}
            </div>
          ) : years.length === 0 ? (
            <p className="timeline-empty">Sin fechas para mostrar.</p>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {years.map((group, gi) => {
                const yr = yearRange(group.year);
                return (
                  <motion.section
                    key={group.year}
                    layout="position"
                    className="timeline-year"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease, delay: Math.min(gi, 6) * 0.04 } }}
                    exit={{ opacity: 0, transition: { duration: 0.14 } }}
                  >
                    <button
                      type="button"
                      className={`timeline-year-head ${isRange(yr) ? "is-active" : ""}`}
                      onClick={() => onRange(isRange(yr) ? null : yr)}
                    >
                      <strong>{group.year}</strong>
                      <span>{formatCount(group.total)}</span>
                    </button>
                    <AnimatePresence initial={false} mode="popLayout">
                      {group.months.map((bucket) => {
                        const mr = monthRange(bucket.year, bucket.month);
                        const active = isRange(mr);
                        return (
                          <motion.button
                            key={bucket.month}
                            layout="position"
                            type="button"
                            className={`timeline-month ${active ? "is-active" : ""}`}
                            onClick={() => onRange(active ? null : mr)}
                            title={`${mr.label}: ${formatCount(bucket.count)}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <span className="timeline-month-name">{monthShortName(bucket.month)}</span>
                            <span className="timeline-bar">
                              <motion.i
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(6, (bucket.count / max) * 100)}%` }}
                                transition={spring}
                              />
                            </span>
                            <span className="timeline-month-count">{formatCount(bucket.count)}</span>
                          </motion.button>
                        );
                      })}
                    </AnimatePresence>
                  </motion.section>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
