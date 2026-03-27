// src/components/delivery/DeliveryDialog.tsx
import { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCreateDeliveryService, useUpdateDeliveryService } from "@/hooks/useApi";

interface DeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery?: any;
}

export const DeliveryDialog = ({ open, onOpenChange, delivery }: DeliveryDialogProps) => {
  const isEditing = !!delivery;
  const [formData, setFormData] = useState({
    name: "",
    active: true,
    cities: [] as string[]
  });
  const [newCity, setNewCity] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createDeliveryService = useCreateDeliveryService();
  const updateDeliveryService = useUpdateDeliveryService();

  useEffect(() => {
    if (delivery) {
      setFormData({
        name: delivery.name || "",
        active: delivery.active ?? true,
        cities: Array.isArray(delivery.cities) ? delivery.cities : []
      });
    } else {
      setFormData({
        name: "",
        active: true,
        cities: []
      });
    }
  }, [delivery]);

  const handleAddCity = () => {
    const trimmedCity = newCity.trim();
    if (trimmedCity && !formData.cities.includes(trimmedCity)) {
      setFormData(prev => ({
        ...prev,
        cities: [...prev.cities, trimmedCity]
      }));
      setNewCity("");
    }
  };

  const handleRemoveCity = (city: string) => {
    setFormData(prev => ({
      ...prev,
      cities: prev.cities.filter(c => c !== city)
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCity();
    }
  };

  const handleSave = async () => {
    // Validation
    if (!formData.name.trim()) {
      return; // Let the browser handle the required field
    }

    if (formData.cities.length === 0) {
      alert("Please add at least one city");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing) {
        await updateDeliveryService.mutateAsync({
          id: delivery.id,
          data: formData
        });
      } else {
        await createDeliveryService.mutateAsync(formData);
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving delivery service:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Delivery Service" : "Add New Delivery Service"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Service Name</Label>
            <Input 
              id="name" 
              placeholder="Enter service name" 
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch 
              id="active" 
              checked={formData.active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, active: checked }))}
            />
            <Label htmlFor="active">Active</Label>
          </div>

          <div className="space-y-2">
            <Label>Cities</Label>
            <div className="flex flex-wrap gap-2 mb-2 min-h-[40px] max-h-[200px] overflow-y-auto p-2 border rounded">
              {formData.cities.length === 0 ? (
                <p className="text-sm text-gray-500">No cities added yet</p>
              ) : (
                formData.cities.map((city) => (
                  <Badge 
                    key={city} 
                    variant="secondary" 
                    className="flex items-center gap-1 px-2 py-1"
                  >
                    {city}
                    <button 
                      type="button" 
                      className="ml-1 text-gray-400 hover:text-gray-600"
                      onClick={() => handleRemoveCity(city)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Input 
                placeholder="Add a city" 
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1"
              />
              <Button 
                type="button" 
                variant="outline"
                onClick={handleAddCity}
                className="flex items-center gap-1"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};