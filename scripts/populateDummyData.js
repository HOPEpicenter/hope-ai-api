"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitorsRepository_1 = require("../src/storage/visitorsRepository");
const formationEventRepository_1 = require("../src/storage/formationEventRepository");
// Get the repositories
const visitorsRepo = new visitorsRepository_1.VisitorsRepository();
const eventsRepo = new formationEventRepository_1.FormationEventRepository();
// Create some dummy visitors
const dummyVisitors = [
    { id: "v1", name: "Alice Smith", email: "alice@example.com" },
    { id: "v2", name: "Bob Johnson", email: "bob@example.com" }
];
// Add them to the repository
dummyVisitors.forEach(v => visitorsRepo.addVisitor(v));
// Create some dummy formation events
const dummyEvents = [
    { id: "e1", visitorId: "v1", type: "login", occurredAt: new Date().toISOString() },
    { id: "e2", visitorId: "v1", type: "completed_module", occurredAt: new Date(Date.now() - 3600 * 1000).toISOString() },
    { id: "e3", visitorId: "v2", type: "login", occurredAt: new Date().toISOString() },
    { id: "e4", visitorId: "v2", type: "completed_module", occurredAt: new Date(Date.now() - 7200 * 1000).toISOString() },
];
// Add events to the repository
dummyEvents.forEach(e => eventsRepo.addEvent(e));
console.log("✅ Dummy visitors and formation events added!");
console.log("Visitors:", dummyVisitors);
console.log("Events:", dummyEvents);
