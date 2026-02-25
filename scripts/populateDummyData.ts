import { VisitorsRepository, Visitor } from "../src/storage/visitorsRepository";
import { FormationEventRepository, FormationEvent } from "../src/storage/formationEventRepository";

// Get the repositories
const visitorsRepo = new VisitorsRepository();
const eventsRepo = new FormationEventRepository();

// Create some dummy visitors
const dummyVisitors: Visitor[] = [
    { id: "v1", name: "Alice Smith", email: "alice@example.com" },
    { id: "v2", name: "Bob Johnson", email: "bob@example.com" }
];

// Add them to the repository
dummyVisitors.forEach(v => visitorsRepo.addVisitor(v));

// Create some dummy formation events
const dummyEvents: FormationEvent[] = [
    { id: "e1", visitorId: "v1", type: "login", occurredAt: new Date().toISOString() },
    { id: "e2", visitorId: "v1", type: "completed_module", occurredAt: new Date(Date.now() - 3600*1000).toISOString() },
    { id: "e3", visitorId: "v2", type: "login", occurredAt: new Date().toISOString() },
    { id: "e4", visitorId: "v2", type: "completed_module", occurredAt: new Date(Date.now() - 7200*1000).toISOString() },
];

// Add events to the repository
dummyEvents.forEach(e => eventsRepo.addEvent(e));

console.log("✅ Dummy visitors and formation events added!");
console.log("Visitors:", dummyVisitors);
console.log("Events:", dummyEvents);
