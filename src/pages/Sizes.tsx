import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/hooks/useApi";
import { toast } from "sonner";

interface Size {
  id: number;
  name: string;
  length: number;
  width: number;
  height: number;
}

const Sizes = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sizeToDelete, setSizeToDelete] = useState<Size | null>(null);
  const { api } = useApi();
  const queryClient = useQueryClient();

  const { data: sizes, isLoading } = useQuery({
    queryKey: ['sizes'],
    queryFn: async () => {
      const { data } = await api.get('/sizes');
      return data;
    }
  });

  const deleteSizeMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/sizes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sizes'] });
      toast.success('Size deleted successfully');
      setSizeToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete size');
    }
  });

  const handleDelete = (size: Size) => {
    setSizeToDelete(size);
  };

  const confirmDelete = () => {
    if (sizeToDelete) {
      deleteSizeMutation.mutate(sizeToDelete.id);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Size Management</h1>
          <Button onClick={() => setIsDialogOpen(true)}>
            Add New Size
          </Button>
        </div>

        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Dimensions (cm)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sizes?.map((size: Size) => (
                  <TableRow key={size.id}>
                    <TableCell>{size.name}</TableCell>
                    <TableCell>{size.length} x {size.width} x {size.height}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(size)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Size</DialogTitle>
            <DialogDescription>
              Enter the size details below.
            </DialogDescription>
          </DialogHeader>
          <SizeForm onSuccess={() => setIsDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!sizeToDelete} onOpenChange={() => setSizeToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Size</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this size? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSizeToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

interface SizeFormProps {
  onSuccess: () => void;
}

const SizeForm = ({ onSuccess }: SizeFormProps) => {
  const [name, setName] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { api } = useApi();
  const queryClient = useQueryClient();

  const createSizeMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.post('/sizes', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sizes'] });
      toast.success('Size created successfully');
      onSuccess();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create size');
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !length || !width || !height) {
      toast.error('All fields are required');
      return;
    }

    setIsSubmitting(true);
    try {
      await createSizeMutation.mutateAsync({
        name,
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter size name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="length">Length (cm)</Label>
        <Input
          id="length"
          type="number"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          placeholder="Enter length"
          step="0.1"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="width">Width (cm)</Label>
        <Input
          id="width"
          type="number"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          placeholder="Enter width"
          step="0.1"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="height">Height (cm)</Label>
        <Input
          id="height"
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          placeholder="Enter height"
          step="0.1"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create Size"}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default Sizes; 