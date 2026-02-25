export interface FormationEvent {
    id: string;
    visitorId: string;
    type: string;
    occurredAt: string;
}

export class FormationEventRepository {
    private events: FormationEvent[] = [];

    // Get all events for a visitor
    async getByVisitor(visitorId: string): Promise<FormationEvent[]> {
        return this.events.filter(e => e.visitorId === visitorId);
    }

    // Get a single event by visitorId + event id
    async getByVisitorAndId(visitorId: string, id: string): Promise<FormationEvent | undefined> {
        return this.events.find(e => e.visitorId === visitorId && e.id === id);
    }

    // List events for a visitor with optional limit and cursor
    async listByVisitor(visitorId: string, limit: number = 10, cursor?: string): Promise<{ items: FormationEvent[], cursor?: string }> {
        const visitorEvents = this.events
            .filter(e => e.visitorId === visitorId)
            .sort((a,b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

        let startIndex = 0;
        if (cursor) {
            startIndex = visitorEvents.findIndex(e => e.id === cursor) + 1;
            if (startIndex <= 0) startIndex = 0;
        }

        const items = visitorEvents.slice(startIndex, startIndex + limit);
        const nextCursor = (startIndex + limit) < visitorEvents.length ? items[items.length - 1].id : undefined;

        return { items, cursor: nextCursor };
    }

    // Add a new event
    async addEvent(event: FormationEvent): Promise<void> {
        this.events.push(event);
    }

    // Get all events (helper)
    async getAllEvents(): Promise<FormationEvent[]> {
        return [...this.events];
    }
}
