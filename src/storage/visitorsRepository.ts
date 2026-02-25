export interface Visitor {
    id: string;
    name: string;
    email: string;
}

export class VisitorsRepository {
    private visitors: Visitor[] = [];

    async getVisitorById(id: string): Promise<Visitor | undefined> {
        return this.visitors.find(v => v.id === id);
    }

    async addVisitor(visitor: Visitor): Promise<void> {
        this.visitors.push(visitor);
    }

    // Get all visitors (helper)
    async getAllVisitors(): Promise<Visitor[]> {
        return [...this.visitors];
    }
}
