import type { VisitorsRepository, Visitor } from "../../repositories";

export type ListVisitorsResult = {
  ok: true;
  count: number;
  limit: number;
  items: Visitor[];
};

export async function listVisitors(input: {
  visitorsRepository: VisitorsRepository;
  limit?: number;
}): Promise<ListVisitorsResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 200));

  const { items, count } = await input.visitorsRepository.list({ limit });

  return {
    ok: true,
    count,
    limit,
    items,
  };
}
