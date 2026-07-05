import type { Status } from "@/lib/data";

export function StatusPill({ value }: { value: Status }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const cls =
    value === "Completed" ? "status-pill status-completed" :
    value === "Scheduled" ? "status-pill status-scheduled" :
    value === "Overdue" || value === "Expired" ? "status-pill status-overdue" :
    "status-pill status-outstanding";
  return <span className={cls}>{value}</span>;
}
