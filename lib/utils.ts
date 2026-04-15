export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function safeNumber(value: string | number | null | undefined | File, fallback: number) {
  if (!value || typeof value === "object") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toBoolean(value: string | number | boolean | null | undefined | File) {
  return value === "true" || value === "1" || value === 1 || value === true;
}

export function getExtension(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? (parts.pop()?.toLowerCase() ?? "") : "";
}
