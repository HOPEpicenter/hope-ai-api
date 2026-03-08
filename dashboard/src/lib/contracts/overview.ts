export type OverviewStat = {
  label: string;
  value: number;
  helper: string;
};

export type OverviewRecentItem = {
  title: string;
  subtitle: string;
  href: string;
};

export type OverviewResponse = {
  ok: boolean;
  stats: OverviewStat[];
  recent: OverviewRecentItem[];
};
