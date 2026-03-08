import { getFollowups } from "@/lib/loaders/get-followups";

export default async function FollowupsPage() {
  const data = await getFollowups();

  return (
    <section>
      <h1>Followups</h1>
      <p>Mock-first view for the internal operator queue.</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, background: "#fff" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Visitor</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Reason</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Assigned</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.visitorId}>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{item.name}</td>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{item.followupReason ?? "-"}</td>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{item.assignedTo ?? "-"}</td>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{item.updatedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
