import { VisitorRepository } from "../../storage/visitorRepository";

export type ListVisitorsResult = {
  ok: true;
  count: number;
  limit: number;
  items: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    status?: string;
    tags?: string[];
    notes?: string;
    source?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
};

export async function listVisitors(input: { limit?: number }): Promise<ListVisitorsResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 200));

  const repo = new VisitorRepository();
  await repo.ensureTable();

  const { items, count } = await repo.list({ limit });

  return {
    ok: true,
    count,
    limit,
    items: items.map(v => ({
      id: v.id,
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      phone: v.phone,
      status: v.status,
      tags: v.tags,
      notes: v.notes,
      source: v.source,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt
    })),
  };
}
