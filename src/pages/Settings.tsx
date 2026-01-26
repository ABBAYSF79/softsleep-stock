import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';

const Settings = () => {
  const { getCommissionSettings, updateCommissionSettings, api } = useApi();
  const queryClient = useQueryClient();
  const [defaultRate, setDefaultRate] = useState(10);
  const [defaultFixedAmount, setDefaultFixedAmount] = useState(0);
  const [useFixedAmount, setUseFixedAmount] = useState(false);
  
  // Size management states
  const [sizes, setSizes] = useState<any[]>([]);
  const [newSize, setNewSize] = useState({
    name: '',
    length: '',
    width: '',
    height: ''
  });

  // Fetch commission settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['commissionSettings'],
    queryFn: async () => {
      const response = await getCommissionSettings();
      return response.data;
    }
  });

  // Fetch sizes
  const { data: sizeData, isLoading: isLoadingSizes } = useQuery({
    queryKey: ['sizes'],
    queryFn: async () => {
      const { data } = await api.get('/sizes');
      return data;
    }
  });

  // Update commission settings
  const updateSettings = useMutation({
    mutationFn: async (data: any) => {
      const response = await updateCommissionSettings(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissionSettings'] });
      toast.success('Commission settings updated successfully');
    },
    onError: (error: any) => {
      console.error('Error updating settings:', error);
      toast.error(error.response?.data?.error || 'Failed to update settings');
    }
  });

  // Add new size
  const addSize = useMutation({
    mutationFn: async (sizeData: any) => {
      const { data } = await api.post('/sizes', sizeData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sizes'] });
      setNewSize({ name: '', length: '', width: '', height: '' });
      toast.success('Size added successfully');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Failed to add size';
      toast.error(errorMessage);
      if (errorMessage.includes('already exists')) {
        // Clear the name field if it's a duplicate
        setNewSize(prev => ({ ...prev, name: '' }));
      }
    }
  });

  // Delete size
  const deleteSize = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete(`/sizes/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sizes'] });
      toast.success('Size deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete size');
    }
  });

  useEffect(() => {
    if (settings) {
      setDefaultRate(Number(settings.defaultRate));
      setDefaultFixedAmount(Number(settings.defaultFixedAmount) || 0);
      setUseFixedAmount(settings.useFixedAmount);
    }
  }, [settings]);

  useEffect(() => {
    if (sizeData) {
      setSizes(sizeData);
    }
  }, [sizeData]);

  const handleSave = () => {
    updateSettings.mutate({
      defaultRate,
      defaultFixedAmount,
      useFixedAmount
    });
  };

  const handleAddSize = () => {
    if (!newSize.name || !newSize.length || !newSize.width || !newSize.height) {
      toast.error('Please fill in all size fields');
      return;
    }

    // Validate dimensions
    const length = parseFloat(newSize.length);
    const width = parseFloat(newSize.width);
    const height = parseFloat(newSize.height);

    if (isNaN(length) || isNaN(width) || isNaN(height)) {
      toast.error('Please enter valid dimensions');
      return;
    }

    if (length <= 0 || width <= 0 || height <= 0) {
      toast.error('Dimensions must be greater than 0');
      return;
    }

    addSize.mutate(newSize);
  };

  const handleDeleteSize = (id: number) => {
    if (window.confirm('Are you sure you want to delete this size?')) {
      deleteSize.mutate(id);
    }
  };

  if (isLoadingSettings || isLoadingSizes) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Commission Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="use-fixed-amount"
              checked={useFixedAmount}
              onCheckedChange={setUseFixedAmount}
            />
            <Label htmlFor="use-fixed-amount">Use Fixed Amount</Label>
          </div>

          {useFixedAmount ? (
            <div className="space-y-2">
              <Label>Default Fixed Amount</Label>
              <Input
                type="number"
                value={defaultFixedAmount}
                onChange={(e) => setDefaultFixedAmount(Number(e.target.value))}
                placeholder="Enter fixed amount"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Default Commission Rate (%)</Label>
              <Input
                type="number"
                value={defaultRate}
                onChange={(e) => setDefaultRate(Number(e.target.value))}
                placeholder="Enter commission rate"
              />
            </div>
          )}

          <Button onClick={handleSave} className="mt-4">
            Save Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Size Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Size Name</Label>
              <Input
                value={newSize.name}
                onChange={(e) => setNewSize({ ...newSize, name: e.target.value })}
                placeholder="e.g., Small, Medium, Large"
              />
            </div>
            <div className="space-y-2">
              <Label>Length (cm)</Label>
              <Input
                type="number"
                value={newSize.length}
                onChange={(e) => setNewSize({ ...newSize, length: e.target.value })}
                placeholder="Length"
              />
            </div>
            <div className="space-y-2">
              <Label>Width (cm)</Label>
              <Input
                type="number"
                value={newSize.width}
                onChange={(e) => setNewSize({ ...newSize, width: e.target.value })}
                placeholder="Width"
              />
            </div>
            <div className="space-y-2">
              <Label>Height (cm)</Label>
              <Input
                type="number"
                value={newSize.height}
                onChange={(e) => setNewSize({ ...newSize, height: e.target.value })}
                placeholder="Height"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddSize} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Size
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Size Name</TableHead>
                  <TableHead>Length (cm)</TableHead>
                  <TableHead>Width (cm)</TableHead>
                  <TableHead>Height (cm)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sizes.map((size) => (
                  <TableRow key={size.id}>
                    <TableCell>{size.name}</TableCell>
                    <TableCell>{size.length}</TableCell>
                    <TableCell>{size.width}</TableCell>
                    <TableCell>{size.height}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteSize(size.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings; 