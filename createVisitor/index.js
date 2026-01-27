const { VisitorRepository } = require("../dist/storage/visitorRepository")
const { v4: uuid } = require("uuid")

module.exports = async function (context, req) {
  const body = req.body || {}

  const now = new Date()

  const visitor = {
    id: uuid(),
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone || "",
    status: "new",
    tags: [],
    notes: "",
    source: "",
    createdAt: now,
    updatedAt: now
  }

  const repo = new VisitorRepository()
  await repo.save(visitor)

  context.res = {
    status: 201,
    body: visitor
  }
}
