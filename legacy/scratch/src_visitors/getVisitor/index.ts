import { VisitorRepository } from "../../storage/visitorRepository";

export async function getVisitor(id: string) {
  const repo = new VisitorRepository();
  const visitor = await repo.getById(id);

  if (!visitor) {
    return {
      status: 404,
      jsonBody: { error: "Visitor not found" }
    };
  }

  return {
    status: 200,
    jsonBody: visitor
  };
}
