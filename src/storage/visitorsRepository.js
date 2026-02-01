"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisitorsRepository = void 0;
class VisitorsRepository {
    constructor() {
        this.visitors = [];
    }
    async getVisitorById(id) {
        return this.visitors.find(v => v.id === id);
    }
    async addVisitor(visitor) {
        this.visitors.push(visitor);
    }
}
exports.VisitorsRepository = VisitorsRepository;
