// src/pages/Delivery.tsx
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
  MapPin
} from "lucide-react";
import { DeliveryDialog } from "@/components/delivery/DeliveryDialog";
import { Badge } from "@/components/ui/badge";
import { useDeliveryServices, useDeleteDeliveryService } from "@/hooks/useApi";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const Delivery = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuth();

  const { data: deliveryServices, isLoading } = useDeliveryServices();
  const deleteDeliveryService = useDeleteDeliveryService();

  const handleNewDelivery = () => {
    setEditingDelivery(null);
    setIsDialogOpen(true);
  };

  const handleEditDelivery = (delivery: any) => {
    setEditingDelivery(delivery);
    setIsDialogOpen(true);
  };

  const handleDeleteDelivery = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this delivery service?')) {
      try {
        await deleteDeliveryService.mutateAsync(id);
      } catch (error) {
        console.error('Error deleting delivery service:', error);
      }
    }
  };

  const filteredServices = deliveryServices?.filter(service => 
    service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    service.cities.some((city: string) => city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
        <h1 className="text-2xl font-bold">Delivery Services</h1>
        <Button onClick={handleNewDelivery} className="flex items-center gap-2 bg-matles-600 hover:bg-matles-700">
          <Plus className="h-4 w-4" />
          <span>Add Delivery Service</span>
        </Button>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search delivery services..." 
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service Name</TableHead>
              <TableHead>Cities</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredServices?.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {service.cities.map((city: string) => (
                      <Badge key={city} variant="outline" className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {city}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={service.active ? "outline" : "secondary"}
                    className={service.active ? "bg-green-50 text-green-600 hover:bg-green-50" : ""}
                  >
                    {service.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleEditDelivery(service)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {user?.role === 'ADMIN' && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleDeleteDelivery(service.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      <DeliveryDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        delivery={editingDelivery}
      />
    </MainLayout>
  );
};

export default Delivery;