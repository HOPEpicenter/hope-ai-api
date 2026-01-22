import { v4 as uuid } from "uuid";
import { VisitorRepository } from "../../storage/visitorRepository";

export async function createVisitor(body: any) {
  const repo = new VisitorRepository();

  const now = new Date().toISOString();

  const visitor = {
    id: uuid(),
    firstName: body.firstName?.trim() ?? "",
    lastName: body.lastName?.trim() ?? "",
    email: body.email?.toLowerCase().trim() ?? "",
    phone: body.phone ?? "",
    status: "new",
    tags: [],
    notes: "",
    source: body.source ?? "",
    createdAt: now,
    updatedAt: now
  };

  await repo.save(visitor);
  return visitor;
}