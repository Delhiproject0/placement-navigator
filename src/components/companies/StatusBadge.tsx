import { Badge } from "@/components/ui/badge";
import type { PlacementStatus } from "@/types/database";

interface StatusBadgeProps {
  status: PlacementStatus;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const variants: Record<PlacementStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    upcoming: { variant: "outline", label: "Upcoming" },
    ongoing: { variant: "default", label: "Ongoing" },
    completed: { variant: "secondary", label: "Completed" },
    cancelled: { variant: "destructive", label: "Cancelled" },
  };

  const { variant, label } = variants[status];

  return <Badge variant={variant}>{label}</Badge>;
};
