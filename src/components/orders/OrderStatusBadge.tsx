import { Badge } from "@/components/ui/badge";
import { ORDER_STATUSES } from "@/utils/order-utils";

interface OrderStatusBadgeProps {
  status: string;
}

export const OrderStatusBadge = ({ status }: OrderStatusBadgeProps) => {
  const statusKey = status as keyof typeof ORDER_STATUSES;
  const statusConfig = ORDER_STATUSES[statusKey];

  if (statusConfig) {
    return (
      <Badge className={statusConfig.color}>
        {statusConfig.label}
      </Badge>
    );
  }

  return <Badge>{status}</Badge>;
};
