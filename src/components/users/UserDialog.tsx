// src/components/users/UserDialog.tsx
import { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { useCreateUser, useUpdateUser } from "@/hooks/useApi";

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: any;
}

export const UserDialog = ({ open, onOpenChange, user }: UserDialogProps) => {
  const isEditing = !!user;
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "SALES"
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        password: "",
        role: user.role || "SALES"
      });
    } else {
      setFormData({
        name: "",
        email: "",
        password: "",
        role: "SALES"
      });
    }
  }, [user]);

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

    setIsSubmitting(true);

    try {
      if (isEditing) {
        const updateData: any = {
          name: formData.name,
          email: formData.email,
          role: formData.role
        };

        if (formData.password) {
          updateData.password = formData.password;
        }

        await updateUser.mutateAsync({
          id: user.id,
          data: updateData
        });
      } else {
        await createUser.mutateAsync(formData);
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving user:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit User" : "Add New User"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update user information" : "Create a new system user"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input 
                id="name" 
                placeholder="Enter user name" 
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email"
                placeholder="Enter email address" 
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select 
                value={formData.role}
                onValueChange={(value) => handleChange('role', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SALES">Sales</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Admin: Full control to all features.
                <br />
                Sales: Can only view their own orders and commissions.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                {isEditing ? "New Password (optional)" : "Password"}
              </Label>
              <Input 
                id="password" 
                type="password"
                placeholder={isEditing ? "Leave blank to keep current password" : "Enter password"}
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
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