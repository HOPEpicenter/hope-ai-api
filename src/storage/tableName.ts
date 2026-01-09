// src/storage/tableName.ts
function isLocalEnv(): boolean {
  const env = (process.env.AZURE_FUNCTIONS_ENVIRONMENT || process.env.NODE_ENV || "").toLowerCase();
  if (env.includes("dev") || env.includes("local")) return true;
  // Functions Core Tools sets this when running locally
  if ((process.env.WEBSITE_INSTANCE_ID || "").trim() === "") return true;
  return false;
}

export function tableName(rawName: string): string {
  const name = (rawName || "").trim();
  if (!name) throw new Error("tableName: rawName is required");

  if (!isLocalEnv()) return name;

  // Normalize any number of leading "dev" prefixes to exactly one.
  // devX, devdevX, devdevdevX => devX
  if (/^dev/i.test(name)) return name.replace(/^dev+/i, "dev");

  return `dev${name}`;
}
