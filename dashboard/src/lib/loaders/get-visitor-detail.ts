import { getMockVisitorDetail } from "@/lib/mocks/visitor-detail";

export async function getVisitorDetail(visitorId: string) {
  return getMockVisitorDetail(visitorId);
}
