const LOCALE = "es-AR";

const shortDate = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric" });
const fullDate = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});
const monthYear = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
const monthShort = new Intl.DateTimeFormat(LOCALE, { month: "short" });
const monthLong = new Intl.DateTimeFormat(LOCALE, { month: "long" });
const integer = new Intl.NumberFormat(LOCALE);

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export const formatCount = (value: number) => integer.format(value);

export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));

export const formatFullDate = (iso: string) => fullDate.format(new Date(iso));

export const formatMonthYear = (iso: string) => capitalize(monthYear.format(new Date(iso)));

export const monthShortName = (month: number) =>
  capitalize(monthShort.format(new Date(2000, month - 1, 1)).replace(".", ""));

export const monthLongName = (month: number) => capitalize(monthLong.format(new Date(2000, month - 1, 1)));

export function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

export function lastSegment(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

/** Month ranges are built in the browser's zone, the same zone the catalog buckets by. */
export function monthRange(year: number, month: number) {
  return {
    from: new Date(year, month - 1, 1).getTime(),
    to: new Date(year, month, 1).getTime(),
    label: `${monthLongName(month)} ${year}`
  };
}

export function yearRange(year: number) {
  return {
    from: new Date(year, 0, 1).getTime(),
    to: new Date(year + 1, 0, 1).getTime(),
    label: String(year)
  };
}
