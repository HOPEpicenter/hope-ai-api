const { VisitorRepository } = require("../dist/storage/visitorRepository")

module.exports = async function (context, req) {
  const id = context.bindingData.id

  const repo = new VisitorRepository()
  const visitor = await repo.getById(id)

  if (!visitor) {
    context.res = { status: 404 }
    return
  }

  context.res = {
    status: 200,
    body: visitor
  }
}
