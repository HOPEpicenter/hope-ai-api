export function tableName(name: string): string {
  const prefix = process.env.TABLE_PREFIX ?? "";
  return `${prefix}${name}`;
}
