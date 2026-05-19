export function compareIsoAsc(a: string | null | undefined, b: string | null | undefined): number {
  return String(a ?? "").localeCompare(String(b ?? ""));
}

export function compareIsoDesc(a: string | null | undefined, b: string | null | undefined): number {
  return compareIsoAsc(b, a);
}

export function compareBooleanDesc(a: boolean, b: boolean): number {
  return Number(b === true) - Number(a === true);
}

export function compareNumberDesc(a: number, b: number): number {
  return b - a;
}
