import Link from "next/link";
import { CreateVisitorForm } from "@/components/create-visitor-form";
import { VisitorsTable, type VisitorsTableItem } from "@/components/visitors-table";
import { getFormationProfiles } from "@/lib/loaders/get-formation-profiles";
import { getVisitors } from "@/lib/loaders/get-visitors";

const MY_ASSIGNEE = (process.env.NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE ?? "").trim();

type VisitorsPageSearchParams = {
  preset?: string;
  q?: string;
};

export default async function VisitorsPage({
  searchParams
}: {
  searchParams?: Promise<VisitorsPageSearchParams>;
}) {
  const [visitors, formationProfiles, resolvedSearchParams] = await Promise.all([
    getVisitors(),
    getFormationProfiles(),
    searchParams ?? Promise.resolve<VisitorsPageSearchParams>({})
  ]);

  const preset =
    resolvedSearchParams.preset === "my-needs-attention" ||
    resolvedSearchParams.preset === "waiting-assignment" ||
    resolvedSearchParams.preset === "assigned-to-me" ||
    resolvedSearchParams.preset === "assigned" ||
    resolvedSearchParams.preset === "contacted" ||
    resolvedSearchParams.preset === "needs-attention"
      ? resolvedSearchParams.preset
      : "all";

  const searchQuery =
    typeof resolvedSearchParams.q === "string"
      ? resolvedSearchParams.q.trim()
      : "";

  const formationProfilesByVisitorId = new Map(
    formationProfiles.items.map((item) => [item.visitorId, item])
  );

  const items: VisitorsTableItem[] = visitors.items.map((visitor) => {
    const profile = formationProfilesByVisitorId.get(visitor.visitorId);

    let followupState: VisitorsTableItem["followupState"] = "Waiting assignment";
    let attentionState: VisitorsTableItem["attentionState"] = null;

    if (profile?.lastFollowupOutcomeAt) {
      followupState = "Contacted";
      attentionState = null;
    } else if (profile?.lastFollowupContactedAt) {
      followupState = "Contacted";
      attentionState = "Contact made";
    } else if (profile?.assignedTo) {
      followupState = "Assigned";
      attentionState = "Needs attention";
    }

    return {
      ...visitor,
      followupState,
      attentionState,
      assignedTo: profile?.assignedTo ?? null
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

  const clearSearchHref =
    preset === "all"
      ? "/visitors"
      : `/visitors?preset=${encodeURIComponent(preset)}`;

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

      <form
        action="/visitors"
        method="get"
        style={{
          display: "grid",
          gap: 10,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
          Search visitors
        </div>

        {preset !== "all" ? <input type="hidden" name="preset" value={preset} /> : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search by name, email, assigned to, or visitor ID"
            style={{
              flex: "1 1 320px",
              minWidth: 260,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#111827",
              font: "inherit"
            }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Search
          </button>
          {searchQuery ? (
            <Link
              href={clearSearchHref}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827",
                textDecoration: "none",
                fontWeight: 600
              }}
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <VisitorsTable
        items={items}
        preset={preset}
        searchQuery={searchQuery}
        assignedToMeCount={assignedToMeCount}
        assignedCount={assignedCount}
        contactedCount={contactedCount}
        needsAttentionCount={needsAttentionCount}
        myAssignee={MY_ASSIGNEE}
        allCount={items.length}
        myNeedsAttentionCount={myNeedsAttentionCount}
      />
    </section>
  );
}

