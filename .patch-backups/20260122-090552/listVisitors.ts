import { VisitorRepository } from "../../storage/visitorRepository";

export type ListVisitorsResult = {
  ok: true;
  count: number;
  limit: number;
  items: Array<{
    id: string;
    name: string;
    email?: string;
    source?: string;
    createdAtIso: string;
  }>;
};

export async function listVisitors(input: { limit?: number }) {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 200));

  const repo = new VisitorRepository();
  await repo.ensureTable();

  const { items, count } = await repo.list({ limit });

  const result: ListVisitorsResult = {
    ok: true,
    count,
    limit,
    items,
  };

  return result;
}
