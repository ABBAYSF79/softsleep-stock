import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Pencil, AlertTriangle } from "lucide-react";
import { useUpdateOrderStatus } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface TrackingCodeCellProps {
  order: any;
}

export const TrackingCodeCell = ({ order }: TrackingCodeCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [trackingCode, setTrackingCode] = useState(order.trackingCode || "");
  const updateOrderStatus = useUpdateOrderStatus();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    setTrackingCode(order.trackingCode || "");
  }, [order.trackingCode]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.stopPropagation(); // Prevent row click or other events
    
    if (trackingCode === order.trackingCode) {
      setIsEditing(false);
      return;
    }

    try {
      await updateOrderStatus.mutateAsync({
        id: order.id,
        status: order.status,
        trackingCode: trackingCode || undefined
      });
      setIsEditing(false);
      toast.success("Tracking code updated");
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleCancel = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTrackingCode(order.trackingCode || "");
    setIsEditing(false);
  };

  const startEditing = (e: React.MouseEvent) => {
    if (!isAdmin) return;
    e.stopPropagation();
    setIsEditing(true);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 min-w-[140px]" onClick={(e) => e.stopPropagation()}>
        <Input
          value={trackingCode}
          onChange={(e) => setTrackingCode(e.target.value)}
          className="h-8 text-xs font-mono"
          placeholder="Tracking code"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <div className="flex flex-col gap-0.5">
            <Button size="icon" variant="ghost" className="h-4 w-4 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={(e) => handleSave(e)}>
                <Check className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-4 w-4 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleCancel}>
                <X className="h-3 w-3" />
            </Button>
        </div>
      </div>
    );
  }

  // Display Mode
  if (order.trackingCode) {
    return (
      <Badge 
        variant="outline" 
        className={`font-mono text-xs flex items-center gap-1 group w-fit ${isAdmin ? "cursor-pointer hover:bg-accent" : ""}`}
        onClick={startEditing}
      >
        {order.trackingCode}
        {isAdmin && <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
      </Badge>
    );
  }

  if (order.status === 'IN_PROCESS') {
    return (
       <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={`flex items-center gap-1.5 text-red-600 bg-red-50 px-2.5 py-1 rounded-md border border-red-200 w-fit animate-pulse ${isAdmin ? "cursor-pointer hover:bg-red-100" : ""}`}
            onClick={startEditing}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-xs font-bold">MISSING</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Tracking code is missing - {isAdmin ? "Click to add" : "Required"}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div 
      className={`flex items-center gap-2 group text-muted-foreground w-fit ${isAdmin ? "cursor-pointer hover:text-foreground" : ""}`}
      onClick={startEditing}
    >
      <span className="text-sm">-</span>
      {isAdmin && <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
    </div>
  );
};
