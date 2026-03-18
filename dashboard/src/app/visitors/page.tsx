import { CreateVisitorForm } from "@/components/create-visitor-form";
import { VisitorsTable, type VisitorsTableItem } from "@/components/visitors-table";
import { getFollowups } from "@/lib/loaders/get-followups";
import { getVisitors } from "@/lib/loaders/get-visitors";

const MY_ASSIGNEE = (process.env.NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE ?? "").trim();

type VisitorsPageSearchParams = {
  preset?: string;
};

export default async function VisitorsPage({
  searchParams
}: {
  searchParams?: Promise<VisitorsPageSearchParams>;
}) {
  const [visitors, followups, resolvedSearchParams] = await Promise.all([
    getVisitors(),
    getFollowups(),
    searchParams ?? Promise.resolve<VisitorsPageSearchParams>({})
  ]);

  const preset =
    resolvedSearchParams.preset === "my-needs-attention" ||
    resolvedSearchParams.preset === "waiting-assignment" ||
    resolvedSearchParams.preset === "assigned-to-me" ||
    resolvedSearchParams.preset === "assigned"
      ? resolvedSearchParams.preset
      : "all";

  const followupsByVisitorId = new Map(
    followups.items.map((item) => [item.visitorId, item])
  );

  const items: VisitorsTableItem[] = visitors.items.map((visitor) => {
    const followup = followupsByVisitorId.get(visitor.visitorId);

    let followupState: VisitorsTableItem["followupState"] = "Waiting assignment";
    let attentionState: VisitorsTableItem["attentionState"] = null;

    if (followup?.lastFollowupOutcomeAt) {
      followupState = "Contacted";
      attentionState = "Contact made";
    } else if (followup?.lastFollowupContactedAt) {
      followupState = "Contacted";
      attentionState = "Contact made";
    } else if (followup?.assignedTo?.ownerId) {
      followupState = "Assigned";
      attentionState = "Needs attention";
    }

    return {
      ...visitor,
      followupState,
      attentionState,
      assignedTo: followup?.assignedTo?.ownerId ?? null
    };
  });

  const waitingAssignmentCount = items.filter((x) => x.followupState === "Waiting assignment").length;
  const assignedCount = items.filter((x) => x.followupState === "Assigned").length;
  const contactedCount = items.filter((x) => x.followupState === "Contacted").length;
  const needsAttentionCount = items.filter((x) => x.attentionState === "Needs attention").length;
  const myNeedsAttentionCount =
    MY_ASSIGNEE.length > 0
      ? items.filter(
          (x) => x.attentionState === "Needs attention" && x.assignedTo === MY_ASSIGNEE
        ).length
      : 0;
  const assignedToMeCount =
    MY_ASSIGNEE.length > 0
      ? items.filter((x) => x.assignedTo === MY_ASSIGNEE).length
      : 0;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Visitors</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Operator visitor directory aligned to the existing visitors and followups surfaces.
        </p>
      </div>

      <CreateVisitorForm />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
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
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Needs Attention</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{needsAttentionCount}</div>
        </div>
      </div>

      <VisitorsTable
        items={items}
        preset={preset}
        assignedToMeCount={assignedToMeCount}
        assignedCount={assignedCount}
        myAssignee={MY_ASSIGNEE}
        allCount={items.length}
        myNeedsAttentionCount={myNeedsAttentionCount}
      />
    </section>
  );
}



