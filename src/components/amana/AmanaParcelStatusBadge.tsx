import { Badge } from "@/components/ui/badge";
import {
  amanaParcelBadgeClass,
  amanaParcelDotClass,
  amanaParcelStatusLabel,
  type AmanaParcelStatusMeta,
} from "@/utils/amanaParcelStatus";
import { cn } from "@/lib/utils";

type Props = {
  status?: AmanaParcelStatusMeta | string | null;
  catalog?: AmanaParcelStatusMeta[];
  className?: string;
  withDot?: boolean;
};

export function AmanaParcelStatusBadge({ status, catalog, className, withDot }: Props) {
  const code = typeof status === "string" ? status : status?.code;
  const label = amanaParcelStatusLabel(status ?? null, catalog);

  return (
    <Badge className={cn(amanaParcelBadgeClass(code), "font-medium", className)}>
      {withDot && (
        <span
          aria-hidden
          className={cn("mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full", amanaParcelDotClass(code))}
        />
      )}
      {label}
    </Badge>
  );
}
