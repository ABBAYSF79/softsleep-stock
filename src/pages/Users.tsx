// src/pages/Users.tsx
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
  Pencil, 
  Trash2, 
  Plus, 
  Search, 
  Shield, 
  ShoppingCart
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserDialog } from "@/components/users/UserDialog";
import { useUsers, useDeleteUser } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/pagination-controls";

const Users = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsers();
  const deleteUser = useDeleteUser();

  // Filter users
  const filteredUsers = users?.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  }) || [];

  const {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    handlePageChange,
    handleItemsPerPageChange
  } = usePagination({
    totalItems: filteredUsers.length,
    initialItemsPerPage: 10,
    storageKey: "users-pagination-limit"
  });

  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  const handleNewUser = () => {
    setEditingUser(null);
    setIsDialogOpen(true);
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    setIsDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    try {
      await deleteUser.mutateAsync(deletingUser.id);
      setDeletingUser(null);
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "ADMIN":
        return <Shield className="h-4 w-4 text-purple-500" />;
      case "SALES":
        return <ShoppingCart className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Admin</Badge>;
      case "SALES":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Sales</Badge>;
      default:
        return <Badge>{role}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div>Loading...</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <Button onClick={handleNewUser} className="flex items-center gap-2 bg-matles-600 hover:bg-matles-700">
          <Plus className="h-4 w-4" />
          <span>Add User</span>
        </Button>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search users..." 
              className="pl-10" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getRoleIcon(user.role)}
                    {getRoleBadge(user.role)}
                  </div>
                </TableCell>
                <TableCell>
                  {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'Never'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleEditUser(user)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-red-500 hover:text-red-600"
                      onClick={() => setDeletingUser(user)}
                      disabled={user.id === currentUser?.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={handleItemsPerPageChange}
          totalItems={filteredUsers.length}
          startIndex={startIndex}
          endIndex={endIndex}
        />
      </div>
      
      <UserDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        user={editingUser}
      />

      <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the user "{deletingUser?.name}". The user will no longer be able to access the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-500 hover:bg-red-600"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default Users;