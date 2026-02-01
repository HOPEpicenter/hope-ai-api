"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormationEventRepository = void 0;
class FormationEventRepository {
    constructor() {
        this.events = [];
    }
    // Get all events for a visitor
    async getByVisitor(visitorId) {
        return this.events.filter((e) => e.visitorId === visitorId);
    }
    // Get a single event by visitorId + event id
    async getByVisitorAndId(visitorId, id) {
        return this.events.find(e => e.visitorId === visitorId && e.id === id);
    }
    // List events for a visitor with optional limit and cursor (basic implementation)
    async listByVisitor(visitorId, limit = 10, cursor) {
        const visitorEvents = this.events
            .filter(e => e.visitorId === visitorId)
            .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
        let startIndex = 0;
        if (cursor) {
            startIndex = visitorEvents.findIndex(e => e.id === cursor) + 1;
            if (startIndex <= 0)
                startIndex = 0;
        }
        const items = visitorEvents.slice(startIndex, startIndex + limit);
        const nextCursor = (startIndex + limit) < visitorEvents.length ? items[items.length - 1].id : undefined;
        return { items, cursor: nextCursor };
    }
    // Add a new event
    async addEvent(event) {
        this.events.push(event);
    }
}
exports.FormationEventRepository = FormationEventRepository;
