import { PageState } from "@/components/page-state";

export default function Loading() {
  return (
    <section style={{ display: "grid", gap: 16 }}>
      <PageState
        title="Loading dashboard…"
        message="Please wait while the latest dashboard view is prepared."
      />
    </section>
  );
}
