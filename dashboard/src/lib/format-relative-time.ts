export function formatAbsoluteTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

export function formatRelativeTime(value: string | null | undefined, now = new Date()) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  if (absMs < minuteMs) {
    return "just now";
  }

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absMs < hourMs) {
    return rtf.format(Math.round(diffMs / minuteMs), "minute");
  }

  if (absMs < dayMs) {
    return rtf.format(Math.round(diffMs / hourMs), "hour");
  }

  if (absMs < weekMs) {
    return rtf.format(Math.round(diffMs / dayMs), "day");
  }

  return formatAbsoluteTime(value);
}
