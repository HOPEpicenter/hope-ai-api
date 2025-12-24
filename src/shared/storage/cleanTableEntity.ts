export function cleanTableEntity<T extends Record<string, any> | null | undefined>(entity: T): T {
  if (!entity || typeof entity !== "object") return entity;

  const copy: any = { ...(entity as any) };

  // Azure Table SDK metadata
  delete copy["odata.metadata"];
  delete copy["odata.etag"];
  delete copy["etag"];
  delete copy["timestamp"];
  delete copy["Timestamp"];

  // Internal keys we usually don't want to expose
  delete copy["partitionKey"];
  delete copy["rowKey"];
  delete copy["PartitionKey"];
  delete copy["RowKey"];

  return copy as T;
}
