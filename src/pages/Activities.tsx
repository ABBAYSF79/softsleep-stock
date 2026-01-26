import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useActivities } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

const ACTIVITIES_PASSWORD = 'ABBA202012141784520BK';

const Activities = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activityType, setActivityType] = useState("all");
  const [password, setPassword] = useState("");
  const [showPasswordDialog, setShowPasswordDialog] = useState(true);
  const { data: activities, isLoading, error, refetch } = useActivities(password);

  const handlePasswordSubmit = () => {
    if (password === ACTIVITIES_PASSWORD) {
      setShowPasswordDialog(false);
      refetch();
    } else {
      toast.error("Invalid password");
    }
  };

  const getActivityBadge = (type: string) => {
    switch (type) {
      case 'ORDER_STATUS_CHANGE':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Order Status</Badge>;
      case 'STOCK_UPDATE':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Stock Update</Badge>;
      case 'LOGIN':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Login</Badge>;
      case 'LOGOUT':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Logout</Badge>;
      case 'PRODUCT_UPDATE':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Product Update</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Other</Badge>;
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-lg">Loading activities...</div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-lg text-red-600">Error loading activities</div>
        </div>
      </MainLayout>
    );
  }

  // Filter activities based on search and type
  const filteredActivities = activities?.filter(activity => {
    const matchesSearch = searchQuery === "" || 
                         activity.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         activity.userName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = activityType === "all" || activity.type === activityType;
    
    return matchesSearch && matchesType;
  }) || [];

  return (
    <MainLayout>
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Activities Password</DialogTitle>
            <DialogDescription>
              Please enter the password to view activities.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePasswordSubmit();
                }
              }}
            />
            <Button onClick={handlePasswordSubmit}>Submit</Button>
          </div>
        </DialogContent>
      </Dialog>

      {!showPasswordDialog && (
        <>
          <h1 className="text-2xl font-bold mb-6">Activities</h1>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Search activities..." 
                  className="pl-10" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select 
                value={activityType}
                onValueChange={setActivityType}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  <SelectItem value="ORDER_STATUS_CHANGE">Order Status Changes</SelectItem>
                  <SelectItem value="STOCK_UPDATE">Stock Updates</SelectItem>
                  <SelectItem value="LOGIN">Logins</SelectItem>
                  <SelectItem value="LOGOUT">Logouts</SelectItem>
                  <SelectItem value="PRODUCT_UPDATE">Product Updates</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActivities.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell>{new Date(activity.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{activity.userName}</TableCell>
                    <TableCell>{getActivityBadge(activity.type)}</TableCell>
                    <TableCell>{activity.description}</TableCell>
                    <TableCell>{activity.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </MainLayout>
  );
};

export default Activities; 