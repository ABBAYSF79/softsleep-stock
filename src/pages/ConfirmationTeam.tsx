import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Pencil,
  Trash2
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from '../lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ConfirmationUser {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  active: boolean;
  linkedSalesUser?: {
    id: number;
    name: string;
    email: string;
  };
  linkedSalesUserId?: number;
}

interface SalesUser {
  id: number;
  name: string;
  email: string;
}

interface FormData {
  name: string;
  phone: string;
  email: string;
  linkedSalesUserId: string;
  active: boolean;
}

const ConfirmationTeam = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ConfirmationUser | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState<FormData>({
    name: "",
    phone: "",
    email: "",
    linkedSalesUserId: "none",
    active: true
  });

  // Fetch confirmation users
  const { data: confirmationUsers = [], isLoading } = useQuery<ConfirmationUser[]>({
    queryKey: ["confirmationUsers"],
    queryFn: async () => {
      const response = await api.get(
        user?.role === "ADMIN" 
          ? "/confirmation-users"
          : "/confirmation-users/my-team",
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );
      return response.data || [];
    }
  });

  // Fetch available sales users (admin only)
  const { data: salesUsers = [], isLoading: isLoadingSalesUsers } = useQuery<SalesUser[]>({
    queryKey: ["salesUsers"],
    queryFn: async () => {
      try {
        console.log("Current user role:", user?.role);
        if (user?.role !== "ADMIN") {
          console.log("User is not admin, skipping sales users fetch");
          return [];
        }
        console.log("Fetching sales users...");
        const response = await api.get("/confirmation-users/available-sales-users");
        console.log("Sales users response:", response.data);
        if (!Array.isArray(response.data)) {
          console.error("Invalid response format:", response.data);
          return [];
        }
        return response.data;
      } catch (error: any) {
        console.error("Error fetching sales users:", error.response?.data || error.message);
        return [];
      }
    },
    enabled: user?.role === "ADMIN"
  });

  // Add debug logging for the Select component
  console.log("Sales users in component:", salesUsers);
  console.log("Is loading sales users:", isLoadingSalesUsers);
  console.log("Is user admin:", user?.role === "ADMIN");

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: async (data: Partial<ConfirmationUser>) => {
      if (editingUser) {
        return api.put(`/confirmation-users/${editingUser.id}`, data);
      }
      return api.post("/confirmation-users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["confirmationUsers"] });
      setIsDialogOpen(false);
      setEditingUser(null);
      setFormData({ name: "", phone: "", email: "", linkedSalesUserId: "none", active: true });
      toast({
        title: "Success",
        description: `Confirmation user ${editingUser ? "updated" : "created"} successfully`
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save confirmation user",
        variant: "destructive"
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.delete(`/confirmation-users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["confirmationUsers"] });
      toast({
        title: "Success",
        description: "Confirmation user deleted successfully"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete confirmation user",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      name: formData.name,
      phone: formData.phone,
      email: formData.email,
      active: formData.active,
      linkedSalesUserId: formData.linkedSalesUserId === "none" ? null : parseInt(formData.linkedSalesUserId)
    });
  };

  const handleEdit = (user: ConfirmationUser) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      phone: user.phone || "",
      email: user.email || "",
      linkedSalesUserId: user.linkedSalesUser?.id.toString() || "none",
      active: user.active
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this confirmation user?")) {
      deleteMutation.mutate(id);
    }
  };

  const filteredUsers = Array.isArray(confirmationUsers) ? confirmationUsers.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.phone?.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-lg">Loading confirmation team...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Confirmation Team</h1>
          <div className="flex items-center gap-4">
            <Button onClick={() => {
              setEditingUser(null);
              setFormData({ name: "", phone: "", email: "", linkedSalesUserId: "none", active: true });
              setIsDialogOpen(true);
            }} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Confirmation User
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search confirmation users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Linked Sales User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers?.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.phone || '-'}</TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell>{user.linkedSalesUser?.name || 'Not linked'}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {user.active ? 'Active' : 'Inactive'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => handleEdit(user)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => handleDelete(user.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Edit Confirmation User' : 'Add Confirmation User'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            {user?.role === "ADMIN" && (
              <div>
                <Label htmlFor="linkedSalesUserId">Linked Sales User</Label>
                <Select
                  value={formData.linkedSalesUserId}
                  onValueChange={(value) => setFormData({ ...formData, linkedSalesUserId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a sales user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {isLoadingSalesUsers ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : Array.isArray(salesUsers) && salesUsers.length > 0 ? (
                      salesUsers.map((salesUser) => (
                        <SelectItem key={salesUser.id} value={salesUser.id.toString()}>
                          {salesUser.name} ({salesUser.email})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-users" disabled>No sales users available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="rounded border-gray-300"
              />
              <Label htmlFor="active">Active</Label>
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingUser ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default ConfirmationTeam; 