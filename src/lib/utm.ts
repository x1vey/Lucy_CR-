import { UTM_KEYS, type UtmParams } from "@/lib/types";

// Shared UTM helpers (no server-only guard — used in the builder UI too).

/** Pull the five utm_* values out of an arbitrary record (form payload, query). */
export function extractUtm(source: Record<string, unknown>): UtmParams {
  const out: UtmParams = {};
  for (const key of UTM_KEYS) {
    const v = source[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return out;
}

/** True if at least one UTM value is present. */
export function hasUtm(utm: UtmParams): boolean {
  return UTM_KEYS.some((k) => !!utm[k]);
}

/** Build a URL with the given UTM params appended to its query string. */
export function buildUtmUrl(baseUrl: string, utm: UtmParams): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "";
  // Tolerate a missing protocol so the builder is forgiving.
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    return "";
  }
  for (const key of UTM_KEYS) {
    const v = utm[key];
    if (v && v.trim()) url.searchParams.set(key, v.trim());
    else url.searchParams.delete(key);
  }
  return url.toString();
}

/** Short "source / medium · campaign" label for display. */
export function utmLabel(utm: UtmParams): string {
  const sm = [utm.utm_source, utm.utm_medium].filter(Boolean).join(" / ");
  return utm.utm_campaign ? `${sm}${sm ? " · " : ""}${utm.utm_campaign}` : sm;
}
