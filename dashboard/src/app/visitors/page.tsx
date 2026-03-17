import { CreateVisitorForm } from "@/components/create-visitor-form";
import { VisitorsTable, type VisitorsTableItem } from "@/components/visitors-table";
import { getFollowups } from "@/lib/loaders/get-followups";
import { getVisitors } from "@/lib/loaders/get-visitors";

export default async function VisitorsPage() {
  const [visitors, followups] = await Promise.all([
    getVisitors(),
    getFollowups()
  ]);

  const followupsByVisitorId = new Map(
    followups.items.map((item) => [item.visitorId, item])
  );

  const items: VisitorsTableItem[] = visitors.items.map((visitor) => {
    const followup = followupsByVisitorId.get(visitor.visitorId);

    let followupState: VisitorsTableItem["followupState"] = "Waiting assignment";

    if (followup?.lastOutcomeAt) {
      followupState = "Contacted";
    } else if (followup?.lastContactedAt) {
      followupState = "Contacted";
    } else if (followup?.assignedTo?.ownerId) {
      followupState = "Assigned";
    }

    return {
      ...visitor,
      followupState,
      assignedTo: followup?.assignedTo?.ownerId ?? null
    };
  });

  const waitingAssignmentCount = items.filter((x) => x.followupState === "Waiting assignment").length;
  const assignedCount = items.filter((x) => x.followupState === "Assigned").length;
  const contactedCount = items.filter((x) => x.followupState === "Contacted").length;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Visitors</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Operator visitor directory aligned to the existing visitors and followups surfaces.
        </p>
      </div>

      <CreateVisitorForm />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Total Visitors</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{items.length}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Waiting Assignment</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{waitingAssignmentCount}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Assigned</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{assignedCount}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Contacted</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{contactedCount}</div>
        </div>
      </div>

      <VisitorsTable items={items} />
    </section>
  );
}
