export function getHopeBaseUrl(): string {
  const v = process.env.HOPE_BASE_URL;
  if (!v) throw new Error("Missing HOPE_BASE_URL");
  return v.replace(/\/+$/, "");
}

export function getHopeApiKey(): string {
  const v = process.env.HOPE_API_KEY;
  if (!v) throw new Error("Missing HOPE_API_KEY");
  return v;
}
