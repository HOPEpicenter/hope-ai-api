export default async function VisitorDetailPage(
  { params }: { params: Promise<{ visitorId: string }> }
) {
  const { visitorId } = await params;

  return (
    <section>
      <h1>Visitor Detail</h1>
      <p>visitorId: {visitorId}</p>
      <p>Mock-first placeholder.</p>
    </section>
  );
}
