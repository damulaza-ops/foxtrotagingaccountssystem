import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type DisplayStatus, type Urgency, type AgingBucket } from "@/lib/aging";

export function StatusBadge({ status }: { status: DisplayStatus }) {
  const styles: Record<DisplayStatus, string> = {
    current: "bg-secondary text-secondary-foreground",
    partially_paid: "bg-warning/15 text-warning-foreground border-warning/40",
    overdue: "bg-destructive/10 text-destructive border-destructive/30",
    paid: "bg-success/15 text-success border-success/30",
    written_off: "bg-muted text-muted-foreground line-through",
    cancelled: "bg-muted text-muted-foreground",
    unverified: "bg-warning/15 text-warning-foreground border-warning/40",
  };
  return (
    <Badge variant="outline" className={cn("font-medium", styles[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function UrgencyBadge({ level }: { level: Urgency }) {
  const styles: Record<Urgency, string> = {
    Current: "bg-secondary text-secondary-foreground",
    Low: "bg-success/15 text-success border-success/30",
    Medium: "bg-warning/15 text-warning-foreground border-warning/40",
    High: "bg-destructive/10 text-destructive border-destructive/30",
    Critical: "bg-destructive text-destructive-foreground",
  };
  return (
    <Badge variant="outline" className={cn("font-medium", styles[level])}>
      {level}
    </Badge>
  );
}

export function BucketBadge({ bucket }: { bucket: AgingBucket }) {
  const overdue = bucket !== "Current";
  return (
    <Badge variant="outline" className={cn(overdue ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-secondary text-secondary-foreground")}>
      {bucket}
    </Badge>
  );
}
