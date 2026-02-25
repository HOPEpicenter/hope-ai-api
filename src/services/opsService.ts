export async function getTimelineForVisitor(visitorId: string, limit: number, debug: boolean) {
    // Dummy timeline data
    return {
        visitorId,
        count: 2,
        timeline: [
            { id: 'evt1', type: 'SERVICE_ATTENDED', occurredAt: new Date().toISOString() },
            { id: 'evt2', type: 'FOLLOWUP_ASSIGNED', occurredAt: new Date().toISOString() }
        ],
        debug
    };
}

export async function getDashboardForVisitor(visitorId: string, timelineLimit: number, debug: boolean) {
    const timelineData = await getTimelineForVisitor(visitorId, timelineLimit, debug);
    // Dummy dashboard mirrors timeline
    return {
        visitorId,
        timelinePreview: timelineData.timeline.slice(0, timelineLimit),
        engagementStatus: 'new',
        formationSnapshot: {},
        debugStorage: { probes: [], resolvedTables: [] }
    };
}
