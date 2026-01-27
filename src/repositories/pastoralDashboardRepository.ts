import { listVisitors } from "./visitorRepository";
import { listTasks, VisitorTask } from "./taskRepository";
import { listStatusHistory } from "./statusHistoryRepository"; // You already built this in Phase 6

export type RiskLevel = "high" | "medium" | "low";

export interface DailyTaskItem {
  visitorId: string;
  visitorName: string;
  priority: VisitorTask["priority"];
  riskLevel: RiskLevel;
  code: string;
  label: string;
  reason: string;
  suggestedChannel: VisitorTask["suggestedChannel"];
  status: string;
  createdAt: string;
}

export interface VisitorInsight {
  visitorId: string;
  visitorName: string;
  email?: string;
  phone?: string;
  tags: string[];

  engagementScore: number;
  engagementCategory: string;

  lastStatus?: string;
  lastStatusAt?: string;
  lastContactDaysAgo: number;
  contactRecencyCategory: string;

  hasTasksToday: boolean;
  highPriorityOpenCount: number;
  totalOpenTasksToday: number;
}

export interface VisitorCard {
  visitorId: string;
  visitorName: string;
  email?: string;
  phone?: string;
  tags: string[];

  engagementScore: number;
  engagementCategory: string;

  lastStatus?: string;
  lastStatusAt?: string;
  lastContactDaysAgo: number;
  contactRecencyCategory: string;

  riskLevel: RiskLevel;
  tasksToday: DailyTaskItem[];
  openTasksToday: DailyTaskItem[];
  highPriorityOpenToday: DailyTaskItem[];
}

export interface DailyDashboardSummary {
  date: string;
  totalVisitors: number;
  totalTasksToday: number;
  openTasks: number;
  highPriorityOpen: number;
  mediumPriorityOpen: number;
  lowPriorityOpen: number;
}

export interface DailyDashboardGroupsByPriority {
  high: DailyTaskItem[];
  medium: DailyTaskItem[];
  low: DailyTaskItem[];
}

export interface DailyDashboardGroupsByRisk {
  high: DailyTaskItem[];
  medium: DailyTaskItem[];
  low: DailyTaskItem[];
}

export interface DashboardAnalytics {
  visitorsWithTasksToday: number;
  visitorsWithHighPriorityTasks: number;
  avgTasksPerVisitorWithTasks: number;
  avgOpenTasksPerVisitorWithTasks: number;
}

export interface DailyDashboard {
  summary: DailyDashboardSummary;
  tasks: DailyTaskItem[];
  byPriority: DailyDashboardGroupsByPriority;
  byRisk: DailyDashboardGroupsByRisk;
  topUrgent: DailyTaskItem[];
  needsAttentionToday: DailyTaskItem[];
  visitorInsights: VisitorInsight[];
  visitorCards: VisitorCard[];
  analytics: DashboardAnalytics;
}

function mapPriorityToRisk(priority: VisitorTask["priority"]): RiskLevel {
  switch (priority) {
    case "high": return "high";
    case "medium": return "medium";
    default: return "low";
  }
}

function sortByUrgency(a: DailyTaskItem, b: DailyTaskItem): number {
  const order = { high: 0, medium: 1, low: 2 };
  const pa = order[a.priority] ?? 3;
  const pb = order[b.priority] ?? 3;
  if (pa !== pb) return pa - pb;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function isNeedsAttention(task: DailyTaskItem): boolean {
  if (task.status !== "open") return false;
  if (task.priority === "high") return true;
  const code = task.code.toLowerCase();
  return code.includes("follow") || code.includes("check");
}

function categorizeEngagement(score: number): string {
  if (score >= 70) return "healthy";
  if (score >= 40) return "moderate";
  if (score >= 20) return "low";
  return "critical";
}

function categorizeContact(days: number): string {
  if (days <= 7) return "fresh";
  if (days <= 30) return "warm";
  if (days <= 90) return "cold";
  return "silent";
}

export async function getDailyDashboard(visitorIds: string[]): Promise<DailyDashboard> {
  const today = new Date().toISOString().split("T")[0];

  const visitors = await listVisitors();
  const visitorMap = new Map<string, any>();
  for (const v of visitors) visitorMap.set(v.rowKey, v);

  let allTasks: VisitorTask[] = [];
  for (const id of visitorIds) {
    const tasks = await listTasks(id);
    allTasks = allTasks.concat(tasks);
  }

  const todayTasks = allTasks.filter(t => t.createdAt.startsWith(today));

  const taskItems: DailyTaskItem[] = todayTasks.map(t => {
    const v = visitorMap.get(t.partitionKey);
    const visitorName = v ? `${v.firstName ?? ""} ${v.lastName ?? ""}`.trim() : t.partitionKey;
    return {
      visitorId: t.partitionKey,
      visitorName,
      priority: t.priority,
      riskLevel: mapPriorityToRisk(t.priority),
      code: t.code,
      label: t.label,
      reason: t.reason,
      suggestedChannel: t.suggestedChannel,
      status: t.status,
      createdAt: t.createdAt
    };
  });

  const openTasks = taskItems.filter(t => t.status === "open");

  const summary: DailyDashboardSummary = {
    date: today,
    totalVisitors: visitors.length,
    totalTasksToday: todayTasks.length,
    openTasks: openTasks.length,
    highPriorityOpen: openTasks.filter(t => t.priority === "high").length,
    mediumPriorityOpen: openTasks.filter(t => t.priority === "medium").length,
    lowPriorityOpen: openTasks.filter(t => t.priority === "low").length
  };

  const byPriority = {
    high: taskItems.filter(t => t.priority === "high"),
    medium: taskItems.filter(t => t.priority === "medium"),
    low: taskItems.filter(t => t.priority === "low")
  };

  const byRisk = {
    high: taskItems.filter(t => t.riskLevel === "high"),
    medium: taskItems.filter(t => t.riskLevel === "medium"),
    low: taskItems.filter(t => t.riskLevel === "low")
  };

  const topUrgent = [...taskItems].sort(sortByUrgency).slice(0, 10);
  const needsAttentionToday = taskItems.filter(isNeedsAttention);

  const visitorInsights: VisitorInsight[] = [];
  const visitorCards: VisitorCard[] = [];

  for (const v of visitors) {
    const vid = v.rowKey;
    const name = `${v.firstName ?? ""} ${v.lastName ?? ""}`.trim() || vid;

    const tags: string[] = Array.isArray(v.tags) ? v.tags : [];

    const statusHistory = await listStatusHistory(vid);
    const lastStatusEntry = statusHistory[0] ?? null;

    const lastStatus = lastStatusEntry?.status;
    const lastStatusAt = lastStatusEntry?.createdAt;

    const lastContactDaysAgo = lastStatusAt
      ? Math.floor((Date.now() - new Date(lastStatusAt).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const contactRecencyCategory = categorizeContact(lastContactDaysAgo);

    const engagementScore = v.engagementScore ?? 0;
    const engagementCategory = categorizeEngagement(engagementScore);

    const tasksForVisitor = taskItems.filter(t => t.visitorId === vid);
    const openForVisitor = tasksForVisitor.filter(t => t.status === "open");
    const highOpenForVisitor = openForVisitor.filter(t => t.priority === "high");

    visitorInsights.push({
      visitorId: vid,
      visitorName: name,
      email: v.email,
      phone: v.phone,
      tags,
      engagementScore,
      engagementCategory,
      lastStatus,
      lastStatusAt,
      lastContactDaysAgo,
      contactRecencyCategory,
      hasTasksToday: tasksForVisitor.length > 0,
      highPriorityOpenCount: highOpenForVisitor.length,
      totalOpenTasksToday: openForVisitor.length
    });

    visitorCards.push({
      visitorId: vid,
      visitorName: name,
      email: v.email,
      phone: v.phone,
      tags,
      engagementScore,
      engagementCategory,
      lastStatus,
      lastStatusAt,
      lastContactDaysAgo,
      contactRecencyCategory,
      riskLevel: highOpenForVisitor.length > 0 ? "high" : openForVisitor.length > 0 ? "medium" : "low",
      tasksToday: tasksForVisitor,
      openTasksToday: openForVisitor,
      highPriorityOpenToday: highOpenForVisitor
    });
  }

  const visitorsWithTasksToday = new Set(taskItems.map(t => t.visitorId)).size;
  const visitorsWithHighPriorityTasks = new Set(
    taskItems.filter(t => t.priority === "high").map(t => t.visitorId)
  ).size;

  const analytics: DashboardAnalytics = {
    visitorsWithTasksToday,
    visitorsWithHighPriorityTasks,
    avgTasksPerVisitorWithTasks:
      visitorsWithTasksToday > 0 ? taskItems.length / visitorsWithTasksToday : 0,
    avgOpenTasksPerVisitorWithTasks:
      visitorsWithTasksToday > 0 ? openTasks.length / visitorsWithTasksToday : 0
  };

  return {
    summary,
    tasks: taskItems,
    byPriority,
    byRisk,
    topUrgent,
    needsAttentionToday,
    visitorInsights,
    visitorCards,
    analytics
  };
}
