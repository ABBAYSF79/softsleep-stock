// src/components/users/UserDialog.tsx
import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useCreateUser, useDeliveryServices, useUpdateUser, useUsers } from "@/hooks/useApi";

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: any;
}

export const UserDialog = ({ open, onOpenChange, user }: UserDialogProps) => {
  const isEditing = !!user;
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const { data: deliveryServices } = useDeliveryServices();
  const { data: allUsers } = useUsers({ enabled: open });

  const adminUsers = useMemo(
    () => (Array.isArray(allUsers) ? allUsers.filter((u: any) => u.role === "ADMIN") : []),
    [allUsers]
  );

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "SALES",
  });
  const [deliveryServiceIds, setDeliveryServiceIds] = useState<number[]>([]);
  const [linkedSalesUserId, setLinkedSalesUserId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        password: "",
        role: user.role || "SALES",
      });
      setDeliveryServiceIds(
        user.role === "LIVREUR"
          ? user.deliveryServiceIds ||
              user.deliveryServices?.map((service: { id: number }) => service.id) ||
              []
          : []
      );
      setLinkedSalesUserId(
        user.linkedSalesUserId ? String(user.linkedSalesUserId) : ""
      );
    } else {
      setFormData({
        name: "",
        email: "",
        password: "",
        role: "SALES",
      });
      setDeliveryServiceIds([]);
      setLinkedSalesUserId("");
    }
  }, [user, open]);

  const toggleDeliveryService = (serviceId: number, checked: boolean) => {
    setDeliveryServiceIds((prev) => {
      if (checked) {
        return [...new Set([...prev, serviceId])];
      }
      return prev.filter((id) => id !== serviceId);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email) {
      toast.error("Name and email are required");
      return;
    }

    if (!isEditing && !formData.password) {
      toast.error("Password is required for new users");
      return;
    }

    if (formData.role === "LIVREUR" && deliveryServiceIds.length === 0) {
      toast.error("Select at least one delivery service for livreur users");
      return;
    }

    if (formData.role === "SUIVI" && !linkedSalesUserId) {
      toast.error("Select a linked admin account for suivi users");
      return;
    }

    setIsSubmitting(true);

    try {
      const resolvedDeliveryServiceIds =
        formData.role === "LIVREUR" ? deliveryServiceIds : [];

      const payload: Record<string, unknown> = {
        ...formData,
        deliveryServiceIds: resolvedDeliveryServiceIds,
        linkedSalesUserId:
          formData.role === "SUIVI" ? Number(linkedSalesUserId) : undefined,
      };

      if (isEditing) {
        const updateData: Record<string, unknown> = {
          name: payload.name,
          email: payload.email,
          role: payload.role,
          deliveryServiceIds: resolvedDeliveryServiceIds,
        };

        if (formData.role === "SUIVI") {
          updateData.linkedSalesUserId = Number(linkedSalesUserId);
        }

        if (formData.password) {
          updateData.password = formData.password;
        }

        await updateUser.mutateAsync({
          id: user.id,
          data: updateData,
        });
      } else {
        await createUser.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving user:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (field === "role" && value !== "LIVREUR") {
      setDeliveryServiceIds([]);
    }

    if (field === "role" && value !== "SUIVI") {
      setLinkedSalesUserId("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1.5 px-6 pt-6 text-left">
          <DialogTitle>{isEditing ? "Edit User" : "Add New User"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update user information" : "Create a new system user"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Enter user name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter email address"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={formData.role} onValueChange={(value) => handleChange("role", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SALES">Sales</SelectItem>
                  <SelectItem value="SUIVI">Suivi</SelectItem>
                  <SelectItem value="LIVREUR">Livreur</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Admin: Full control to all features.
                <br />
                Sales: Can only view their own orders and commissions.
                <br />
                Suivi: Order entry and follow-up on all delivery services (orders attributed to linked admin).
                <br />
                Livreur: Can view and deliver orders for assigned delivery services.
              </p>
            </div>

            {formData.role === "SUIVI" && (
              <>
                <div className="space-y-2">
                  <Label>Linked admin (seller)</Label>
                  <Select value={linkedSalesUserId} onValueChange={setLinkedSalesUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select admin account" />
                    </SelectTrigger>
                    <SelectContent>
                      {adminUsers.map((admin: any) => (
                        <SelectItem key={admin.id} value={String(admin.id)}>
                          {admin.name} ({admin.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
                  This user will have access to all delivery services and their orders.
                </div>
              </>
            )}

            {formData.role === "LIVREUR" && (
              <div className="space-y-2">
                <Label>Delivery services</Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                  {deliveryServices?.length ? (
                    deliveryServices.map((service: any) => (
                      <label
                        key={service.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={deliveryServiceIds.includes(service.id)}
                          onCheckedChange={(checked) =>
                            toggleDeliveryService(service.id, Boolean(checked))
                          }
                        />
                        <span>{service.name}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No delivery services available</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">
                {isEditing ? "New Password (optional)" : "Password"}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={isEditing ? "Leave blank to keep current password" : "Enter password"}
                value={formData.password}
                onChange={(e) => handleChange("password", e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
