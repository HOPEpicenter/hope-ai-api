import { VisitorRepository } from "../../storage/visitorRepository";

export async function getVisitorById(id: string) {
  const repo = new VisitorRepository();
  return await repo.getById(id);
}