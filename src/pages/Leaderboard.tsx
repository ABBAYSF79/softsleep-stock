import { useState, useEffect } from "react";
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
  Trophy,
  MapPin,
  Truck,
  Package,
  ArrowUpDown,
  Search,
  Download,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Zap,
  Clock,
  DollarSign,
  Users,
  BarChart3,
  PieChart,
  Activity,
  Star,
  Medal,
  Crown,
  Flame,
  Rocket,
  ShoppingCart
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrders, useUsers } from "@/hooks/useApi";
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay, subWeeks, subMonths } from "date-fns";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type LeaderboardType = 'sales' | 'cities' | 'delivery' | 'products' | 'returns' | 'confirmation' | 'performance';

type BaseLeaderboardItem = {
  name: string;
  value: number;
  rank?: number;
  trend?: 'up' | 'down' | 'stable';
  change?: number;
  percentage?: number;
};

type SalesLeaderboardItem = BaseLeaderboardItem & {
  orders: number;
  commission: number;
  avgOrderValue: number;
  conversionRate: number;
  lastOrderDate?: string;
  streak?: number;
  achievements?: string[];
};

type CityLeaderboardItem = BaseLeaderboardItem & {
  orders: number;
  avgOrderValue: number;
  growth: number;
};

type DeliveryLeaderboardItem = BaseLeaderboardItem & {
  orders: number;
  avgOrderValue: number;
  successRate: number;
};

type ProductLeaderboardItem = BaseLeaderboardItem & {
  quantity: number;
  revenue: number;
  profitMargin: number;
  popularity: number;
};

type ReturnLeaderboardItem = BaseLeaderboardItem & {
  quantity: number;
  returnRate: number;
  impact: number;
};

type ConfirmationLeaderboardItem = BaseLeaderboardItem & {
  orders: number;
  commission: number;
  successRate: number;
  avgProcessingTime: number;
  customerSatisfaction: number;
};

type PerformanceLeaderboardItem = BaseLeaderboardItem & {
  orders: number;
  commission: number;
  efficiency: number;
  consistency: number;
  growth: number;
  achievements: string[];
};

type LeaderboardItem = 
  | SalesLeaderboardItem 
  | CityLeaderboardItem 
  | DeliveryLeaderboardItem 
  | ProductLeaderboardItem 
  | ReturnLeaderboardItem
  | ConfirmationLeaderboardItem
  | PerformanceLeaderboardItem;

// Performance Metrics Types
type PerformanceMetrics = {
  totalSales: number;
  totalOrders: number;
  totalCommission: number;
  avgOrderValue: number;
  conversionRate: number;
  growthRate: number;
  topPerformer: string;
  mostImproved: string;
  teamEfficiency: number;
  goalProgress: number;
};

type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  progress: number;
  target: number;
  reward: string;
};

type Goal = {
  id: string;
  name: string;
  target: number;
  current: number;
  deadline: string;
  type: 'sales' | 'orders' | 'commission' | 'custom';
  priority: 'high' | 'medium' | 'low';
};

// Type predicates
const isSalesItem = (item: LeaderboardItem): item is SalesLeaderboardItem => 
  'orders' in item && 'commission' in item && 'avgOrderValue' in item;

const isCityItem = (item: LeaderboardItem): item is CityLeaderboardItem => 
  'orders' in item && 'avgOrderValue' in item && !('commission' in item);

const isDeliveryItem = (item: LeaderboardItem): item is DeliveryLeaderboardItem => 
  'orders' in item && 'successRate' in item;

const isProductItem = (item: LeaderboardItem): item is ProductLeaderboardItem => 
  'quantity' in item && 'revenue' in item;

const isReturnItem = (item: LeaderboardItem): item is ReturnLeaderboardItem => 
  'quantity' in item && 'returnRate' in item;

const isConfirmationItem = (item: LeaderboardItem): item is ConfirmationLeaderboardItem => 
  'orders' in item && 'successRate' in item && 'avgProcessingTime' in item;

const isPerformanceItem = (item: LeaderboardItem): item is PerformanceLeaderboardItem => 
  'efficiency' in item && 'consistency' in item && 'achievements' in item;

// Utility functions
const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
  switch (trend) {
    case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
    case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
    default: return <Activity className="h-4 w-4 text-gray-500" />;
  }
};

const getRankIcon = (rank: number) => {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  if (rank <= 5) return <Star className="h-4 w-4 text-blue-500" />;
  if (rank <= 10) return <Trophy className="h-4 w-4 text-purple-500" />;
  return <Target className="h-4 w-4 text-gray-400" />;
};

const getAchievementIcon = (achievement: string) => {
  switch (achievement) {
    case 'first_sale': return <Rocket className="h-4 w-4 text-blue-500" />;
    case 'top_seller': return <Crown className="h-4 w-4 text-yellow-500" />;
    case 'streak_master': return <Flame className="h-4 w-4 text-orange-500" />;
    case 'customer_favorite': return <Star className="h-4 w-4 text-pink-500" />;
    default: return <Award className="h-4 w-4 text-gray-500" />;
  }
};

export default function Leaderboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>('sales');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'table' | 'charts' | 'goals' | 'compare'>('table');
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [compareMode, setCompareMode] = useState<'users' | 'teams'>('users');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const itemsPerPage = 10;
  const { data: orders } = useOrders();
  const { data: users } = useUsers();

  // Performance metrics state
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    totalSales: 0,
    totalOrders: 0,
    totalCommission: 0,
    avgOrderValue: 0,
    conversionRate: 0,
    growthRate: 0,
    topPerformer: '',
    mostImproved: '',
    teamEfficiency: 0,
    goalProgress: 0
  });

  // Goals and achievements state
  const [goals, setGoals] = useState<Goal[]>([
    {
      id: '1',
      name: 'Monthly Sales Target',
      target: 50000,
      current: 0,
      deadline: '2024-01-31',
      type: 'sales',
      priority: 'high'
    },
    {
      id: '2',
      name: 'Order Volume Goal',
      target: 200,
      current: 0,
      deadline: '2024-01-31',
      type: 'orders',
      priority: 'medium'
    }
  ]);

  const [achievements, setAchievements] = useState<Achievement[]>([
    {
      id: '1',
      name: 'First Sale',
      description: 'Complete your first sale',
      icon: 'first_sale',
      earned: false,
      progress: 0,
      target: 1,
      reward: 'Rookie Badge'
    },
    {
      id: '2',
      name: 'Top Seller',
      description: 'Be the top seller for a month',
      icon: 'top_seller',
      earned: false,
      progress: 0,
      target: 1,
      reward: 'Champion Badge'
    },
    {
      id: '3',
      name: 'Streak Master',
      description: 'Maintain a 7-day sales streak',
      icon: 'streak_master',
      earned: false,
      progress: 0,
      target: 7,
      reward: 'Consistency Badge'
    }
  ]);

  // Filter orders based on date range
  const filteredOrders = orders?.filter(order => {
    const orderDate = new Date(order.createdAt);
    const matchesDateRange = !dateRange || (
      orderDate >= dateRange.from && 
      orderDate <= dateRange.to
    );
    return matchesDateRange;
  }) || [];

  // Calculate performance metrics
  useEffect(() => {
    if (filteredOrders.length > 0) {
      const totalSales = filteredOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
      const totalOrders = filteredOrders.length;
      const totalCommission = filteredOrders.reduce((sum, order) => sum + Number(order.commission), 0);
      const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
      
      // Calculate growth rate (compare with previous period)
      const previousPeriodOrders = orders?.filter(order => {
        const orderDate = new Date(order.createdAt);
        const periodStart = subMonths(dateRange?.from || new Date(), 1);
        const periodEnd = subMonths(dateRange?.to || new Date(), 1);
        return orderDate >= periodStart && orderDate <= periodEnd;
      }) || [];
      
      const previousSales = previousPeriodOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
      const growthRate = previousSales > 0 ? ((totalSales - previousSales) / previousSales) * 100 : 0;
      
      // Find top performer
      const salesByUser = filteredOrders.reduce((acc: any, order) => {
        const salesman = order.salesman?.name || 'Unknown';
        if (!acc[salesman]) {
          acc[salesman] = { totalSales: 0, totalOrders: 0 };
        }
        acc[salesman].totalSales += Number(order.totalAmount);
        acc[salesman].totalOrders += 1;
        return acc;
      }, {});
      
      const topPerformer = Object.entries(salesByUser)
        .sort(([,a]: any, [,b]: any) => b.totalSales - a.totalSales)[0]?.[0] || 'N/A';
      
      setPerformanceMetrics({
        totalSales,
        totalOrders,
        totalCommission,
        avgOrderValue,
        conversionRate: 0, // This would need more complex calculation
        growthRate,
        topPerformer,
        mostImproved: topPerformer, // Simplified for now
        teamEfficiency: 85, // Mock data
        goalProgress: (totalSales / 50000) * 100 // Based on first goal
      });
    }
  }, [filteredOrders, dateRange, orders]);

  // Calculate trend data for charts
  const getTrendData = () => {
    const days = 7;
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayOrders = filteredOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate.toDateString() === date.toDateString();
      });
      
      const daySales = dayOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
      const dayOrdersCount = dayOrders.length;
      
      data.push({
        date: format(date, 'MMM dd'),
        sales: daySales,
        orders: dayOrdersCount,
        commission: dayOrders.reduce((sum, order) => sum + Number(order.commission), 0)
      });
    }
    
    return data;
  };

  // Calculate pie chart data for sales distribution
  const getSalesDistributionData = () => {
    const salesByUser = filteredOrders.reduce((acc: any, order) => {
      const salesman = order.salesman?.name || 'Unknown';
      if (!acc[salesman]) {
        acc[salesman] = 0;
      }
      acc[salesman] += Number(order.totalAmount);
      return acc;
    }, {});
    
    const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#ff00ff', '#00ffff'];
    
    return Object.entries(salesByUser).map(([name, value], index) => ({
      name,
      value: Number(value),
      color: colors[index % colors.length]
    }));
  };

  // Calculate comparison data for users
  const getUserComparisonData = () => {
    if (selectedUsers.length < 2) return [];
    
    return selectedUsers.map(userName => {
      const userOrders = filteredOrders.filter(order => order.salesman?.name === userName);
      const totalSales = userOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
      const totalOrders = userOrders.length;
      const totalCommission = userOrders.reduce((sum, order) => sum + Number(order.commission), 0);
      const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
      const deliveredOrders = userOrders.filter(order => order.status === 'DELIVERED').length;
      const successRate = totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0;
      
      // Calculate streak
      const sortedOrders = userOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      let streak = 0;
      let currentDate = new Date();
      
      for (const order of sortedOrders) {
        const orderDate = new Date(order.createdAt);
        const daysDiff = Math.floor((currentDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === streak) {
          streak++;
          currentDate = orderDate;
        } else {
          break;
        }
      }
      
      return {
        name: userName,
        totalSales,
        totalOrders,
        totalCommission,
        avgOrderValue,
        successRate,
        streak,
        lastOrderDate: sortedOrders[0]?.createdAt || null,
        growth: 0 // Mock data - would need historical comparison
      };
    });
  };

  // Calculate comparison data for teams (grouped by confirmation users)
  const getTeamComparisonData = () => {
    if (selectedTeams.length < 2) return [];
    
    return selectedTeams.map(teamName => {
      // For teams, we'll group by confirmation users and their linked sales users
      const teamOrders = filteredOrders.filter(order => {
        const confirmationUser = order.confirmationUser?.name;
        const salesman = order.salesman?.name;
        return confirmationUser === teamName || salesman === teamName;
      });
      
      const totalSales = teamOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
      const totalOrders = teamOrders.length;
      const totalCommission = teamOrders.reduce((sum, order) => sum + Number(order.commission), 0);
      const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
      const deliveredOrders = teamOrders.filter(order => order.status === 'DELIVERED').length;
      const successRate = totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0;
      
      // Calculate team efficiency (orders per day)
      const daysInPeriod = dateRange ? 
        Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) : 30;
      const efficiency = daysInPeriod > 0 ? totalOrders / daysInPeriod : 0;
      
      return {
        name: teamName,
        totalSales,
        totalOrders,
        totalCommission,
        avgOrderValue,
        successRate,
        efficiency,
        teamSize: new Set(teamOrders.map(order => order.salesman?.name)).size,
        growth: 0 // Mock data
      };
    });
  };

  // Get available users for comparison
  const getAvailableUsers = () => {
    const userNames = new Set(filteredOrders.map(order => order.salesman?.name).filter(Boolean));
    return Array.from(userNames).sort();
  };

  // Get available teams for comparison
  const getAvailableTeams = () => {
    const teamNames = new Set([
      ...filteredOrders.map(order => order.confirmationUser?.name).filter(Boolean),
      ...filteredOrders.map(order => order.salesman?.name).filter(Boolean)
    ]);
    return Array.from(teamNames).sort();
  };

  // Comparison handlers
  const handleUserSelection = (userName: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers(prev => [...prev, userName]);
    } else {
      setSelectedUsers(prev => prev.filter(name => name !== userName));
    }
  };

  const handleTeamSelection = (teamName: string, checked: boolean) => {
    if (checked) {
      setSelectedTeams(prev => [...prev, teamName]);
    } else {
      setSelectedTeams(prev => prev.filter(name => name !== teamName));
    }
  };

  const clearComparison = () => {
    setSelectedUsers([]);
    setSelectedTeams([]);
    setComparisonData([]);
  };

  // Update comparison data when selections change
  useEffect(() => {
    if (compareMode === 'users' && selectedUsers.length >= 2) {
      setComparisonData(getUserComparisonData());
    } else if (compareMode === 'teams' && selectedTeams.length >= 2) {
      setComparisonData(getTeamComparisonData());
    } else {
      setComparisonData([]);
    }
  }, [selectedUsers, selectedTeams, compareMode, filteredOrders, dateRange]);

  // Helper functions
  const calculateStreak = (orders: any[]) => {
    if (orders.length === 0) return 0;
    
    const sortedOrders = orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    let streak = 0;
    let currentDate = new Date();
    
    for (const order of sortedOrders) {
      const orderDate = new Date(order.createdAt);
      const daysDiff = Math.floor((currentDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === streak) {
        streak++;
        currentDate = orderDate;
      } else {
        break;
      }
    }
    
    return streak;
  };

  const getAchievementsForUser = (data: any) => {
    const userAchievements = [];
    
    if (data.totalOrders >= 1) userAchievements.push('first_sale');
    if (data.totalSales >= 10000) userAchievements.push('top_seller');
    if (calculateStreak(data.orders) >= 7) userAchievements.push('streak_master');
    if (data.totalOrders >= 50) userAchievements.push('customer_favorite');
    
    return userAchievements;
  };

  // Calculate leaderboard data
  const getLeaderboardData = (): LeaderboardItem[] => {
    switch (leaderboardType) {
      case 'sales':
        // Top sales users with enhanced metrics
        const salesByUser = filteredOrders.reduce((acc: any, order) => {
          const salesman = order.salesman?.name || 'Unknown';
          if (!acc[salesman]) {
            acc[salesman] = {
              totalSales: 0,
              totalOrders: 0,
              totalCommission: 0,
              orders: [],
              lastOrderDate: null
            };
          }
          acc[salesman].totalSales += Number(order.totalAmount);
          acc[salesman].totalOrders += 1;
          acc[salesman].totalCommission += Number(order.commission);
          acc[salesman].orders.push(order);
          if (!acc[salesman].lastOrderDate || new Date(order.createdAt) > new Date(acc[salesman].lastOrderDate)) {
            acc[salesman].lastOrderDate = order.createdAt;
          }
          return acc;
        }, {});

        return Object.entries(salesByUser)
          .map(([name, data]: [string, any], index) => {
            const avgOrderValue = data.totalOrders > 0 ? data.totalSales / data.totalOrders : 0;
            const conversionRate = 85; // Mock data - would need more complex calculation
            const streak = calculateStreak(data.orders);
            const achievements = getAchievementsForUser(data);
            
            return {
              name,
              value: data.totalSales,
              orders: data.totalOrders,
              commission: data.totalCommission,
              avgOrderValue,
              conversionRate,
              lastOrderDate: data.lastOrderDate,
              streak,
              achievements,
              rank: index + 1,
              trend: 'up' as const, // Simplified
              change: 0, // Would need historical comparison
              percentage: 0 // Would need total calculation
            };
          })
          .sort((a, b) => b.value - a.value);

      case 'cities':
        // Top cities
        const salesByCity = filteredOrders.reduce((acc: any, order) => {
          const city = order.city || 'Unknown';
          if (!acc[city]) {
            acc[city] = {
              totalSales: 0,
              totalOrders: 0
            };
          }
          acc[city].totalSales += Number(order.totalAmount);
          acc[city].totalOrders += 1;
          return acc;
        }, {});

        return Object.entries(salesByCity)
          .map(([name, data]: [string, any]) => ({
            name,
            value: data.totalSales,
            orders: data.totalOrders,
            avgOrderValue: data.totalOrders > 0 ? data.totalSales / data.totalOrders : 0,
            growth: 0 // Mock data
          }))
          .sort((a, b) => b.value - a.value);

      case 'delivery':
        // Top delivery services
        const salesByDelivery = filteredOrders.reduce((acc: any, order) => {
          const service = order.deliveryService?.name || 'Unknown';
          if (!acc[service]) {
            acc[service] = {
              totalSales: 0,
              totalOrders: 0
            };
          }
          acc[service].totalSales += Number(order.totalAmount);
          acc[service].totalOrders += 1;
          return acc;
        }, {});

        return Object.entries(salesByDelivery)
          .map(([name, data]: [string, any]) => ({
            name,
            value: data.totalSales,
            orders: data.totalOrders,
            avgOrderValue: data.totalOrders > 0 ? data.totalSales / data.totalOrders : 0,
            successRate: 95 // Mock data
          }))
          .sort((a, b) => b.value - a.value);

      case 'products':
        // Top products
        const salesByProduct = filteredOrders.reduce((acc: any, order) => {
          order.items?.forEach(item => {
            const product = item.product?.name || 'Unknown';
            const variant = item.variant?.name || '';
            const key = `${product}${variant ? ` - ${variant}` : ''}`;
            if (!acc[key]) {
              acc[key] = {
                totalSales: 0,
                totalQuantity: 0
              };
            }
            acc[key].totalSales += Number(item.price) * Number(item.quantity);
            acc[key].totalQuantity += Number(item.quantity);
          });
          return acc;
        }, {});

        return Object.entries(salesByProduct)
          .map(([name, data]: [string, any]) => ({
            name,
            value: data.totalSales,
            quantity: data.totalQuantity,
            revenue: data.totalSales,
            profitMargin: 25, // Mock data
            popularity: data.totalQuantity
          }))
          .sort((a, b) => b.value - a.value);

      case 'returns':
        // Top returned products
        const returnsByProduct = filteredOrders.reduce((acc: any, order) => {
          if (order.status === 'RETURNED') {
            order.items?.forEach(item => {
              const product = item.product?.name || 'Unknown';
              const variant = item.variant?.name || '';
              const key = `${product}${variant ? ` - ${variant}` : ''}`;
              if (!acc[key]) {
                acc[key] = {
                  totalReturns: 0,
                  totalQuantity: 0
                };
              }
              acc[key].totalReturns += Number(item.price) * Number(item.quantity);
              acc[key].totalQuantity += Number(item.quantity);
            });
          }
          return acc;
        }, {});

        return Object.entries(returnsByProduct)
          .map(([name, data]: [string, any]) => ({
            name,
            value: data.totalReturns,
            quantity: data.totalQuantity,
            returnRate: 5, // Mock data
            impact: data.totalReturns
          }))
          .sort((a, b) => b.value - a.value);

      case 'confirmation':
        // Top confirmation users
        const confirmationByUser = filteredOrders.reduce((acc: any, order) => {
          const confirmationUser = order.confirmationUser?.name || 'No Confirmation User';
          if (!acc[confirmationUser]) {
            acc[confirmationUser] = {
              totalSales: 0,
              totalOrders: 0,
              totalCommission: 0,
              successfulOrders: 0
            };
          }
          acc[confirmationUser].totalSales += Number(order.totalAmount);
          acc[confirmationUser].totalOrders += 1;
          acc[confirmationUser].totalCommission += Number(order.commission);
          if (order.status === 'DELIVERED') {
            acc[confirmationUser].successfulOrders += 1;
          }
          return acc;
        }, {});

        return Object.entries(confirmationByUser)
          .map(([name, data]: [string, any]) => {
            const successRate = data.totalOrders > 0 ? (data.successfulOrders / data.totalOrders) * 100 : 0;
            const avgProcessingTime = 2.5; // Mock data - would need actual calculation
            const customerSatisfaction = Math.min(95, successRate + 10); // Mock calculation
            
            return {
              name,
              value: data.totalSales,
              orders: data.totalOrders,
              commission: data.totalCommission,
              successRate,
              avgProcessingTime,
              customerSatisfaction
            };
          })
          .sort((a, b) => b.value - a.value);

      case 'performance':
        // Performance-based leaderboard
        const performanceByUser = filteredOrders.reduce((acc: any, order) => {
          const salesman = order.salesman?.name || 'Unknown';
          if (!acc[salesman]) {
            acc[salesman] = {
              totalSales: 0,
              totalOrders: 0,
              totalCommission: 0,
              orders: []
            };
          }
          acc[salesman].totalSales += Number(order.totalAmount);
          acc[salesman].totalOrders += 1;
          acc[salesman].totalCommission += Number(order.commission);
          acc[salesman].orders.push(order);
          return acc;
        }, {});

        return Object.entries(performanceByUser)
          .map(([name, data]: [string, any]) => {
            const efficiency = data.totalOrders > 0 ? (data.totalSales / data.totalOrders) / 100 : 0;
            const consistency = 85; // Mock data
            const growth = 15; // Mock data
            const achievements = getAchievementsForUser(data);
            
            return {
              name,
              value: data.totalSales,
              orders: data.totalOrders,
              commission: data.totalCommission,
              efficiency,
              consistency,
              growth,
              achievements
            };
          })
          .sort((a, b) => b.value - a.value);

      default:
        return [];
    }
  };

  const leaderboardData = getLeaderboardData();

  // Calculate pagination
  const totalPages = Math.ceil(leaderboardData.length / itemsPerPage);
  const paginatedLeaderboardData = leaderboardData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleExport = () => {
    if (!leaderboardData.length) return;

    const getValue = (item: LeaderboardItem) => {
      if (isSalesItem(item)) return item.orders;
      if (isCityItem(item)) return item.orders;
      if (isDeliveryItem(item)) return item.orders;
      if (isProductItem(item)) return item.quantity;
      if (isReturnItem(item)) return item.quantity;
      if (isConfirmationItem(item)) return item.orders;
      if (isPerformanceItem(item)) return item.orders;
      return 0;
    };

    const headers = [
      'Rank',
      leaderboardType === 'sales' ? 'Salesman' :
      leaderboardType === 'confirmation' ? 'Confirmation User' :
      leaderboardType === 'performance' ? 'Performer' :
      leaderboardType === 'cities' ? 'City' :
      leaderboardType === 'delivery' ? 'Delivery Service' :
      leaderboardType === 'products' ? 'Product' :
      'Product',
      'Value',
      leaderboardType === 'sales' ? 'Orders' :
      leaderboardType === 'confirmation' ? 'Success Rate' :
      leaderboardType === 'performance' ? 'Efficiency' :
      leaderboardType === 'cities' ? 'Orders' :
      leaderboardType === 'delivery' ? 'Orders' :
      leaderboardType === 'products' ? 'Quantity' :
      'Quantity'
    ];

    const rows = leaderboardData.map((item, index) => [
      index + 1,
      item.name,
      `MAD ${item.value.toFixed(2)}`,
      getValue(item)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${leaderboardType}-leaderboard-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header with Performance Metrics */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Performance Leaderboard</h1>
            <p className="text-gray-600">Track team performance and achievements</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export Data
            </Button>
            <Button className="gap-2">
              <Target className="h-4 w-4" />
              Set Goals
            </Button>
          </div>
        </div>

        {/* Performance Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">MAD {performanceMetrics.totalSales.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {performanceMetrics.growthRate > 0 ? '+' : ''}{performanceMetrics.growthRate.toFixed(1)}% from last period
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{performanceMetrics.totalOrders}</div>
              <p className="text-xs text-muted-foreground">
                Avg: MAD {performanceMetrics.avgOrderValue.toFixed(2)} per order
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Performer</CardTitle>
              <Crown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{performanceMetrics.topPerformer}</div>
              <p className="text-xs text-muted-foreground">Leading the team</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Goal Progress</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{performanceMetrics.goalProgress.toFixed(0)}%</div>
              <Progress value={performanceMetrics.goalProgress} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different views */}
        <Tabs value={viewMode} onValueChange={(value: 'table' | 'charts' | 'goals' | 'compare') => setViewMode(value)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="table" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="charts" className="gap-2">
              <PieChart className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-2">
              <Target className="h-4 w-4" />
              Goals & Achievements
            </TabsTrigger>
            <TabsTrigger value="compare" className="gap-2">
              <Users className="h-4 w-4" />
              Compare
            </TabsTrigger>
          </TabsList>

          <TabsContent value="table" className="space-y-4">
            {/* Enhanced Filters */}
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search performers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Select value={leaderboardType} onValueChange={(value: LeaderboardType) => setLeaderboardType(value)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select leaderboard type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Top Sales Users
                    </div>
                  </SelectItem>
                  <SelectItem value="confirmation">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Confirmation Team
                    </div>
                  </SelectItem>
                  <SelectItem value="performance">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Performance Score
                    </div>
                  </SelectItem>
                  <SelectItem value="cities">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Top Cities
                    </div>
                  </SelectItem>
                  <SelectItem value="delivery">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      Delivery Services
                    </div>
                  </SelectItem>
                  <SelectItem value="products">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Top Products
                    </div>
                  </SelectItem>
                  <SelectItem value="returns">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      Returns Analysis
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    setDateRange({ 
                      from: startOfDay(today), 
                      to: endOfDay(today) 
                    });
                  }}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const yesterday = subDays(new Date(), 1);
                    setDateRange({ 
                      from: startOfDay(yesterday), 
                      to: endOfDay(yesterday) 
                    });
                  }}
                >
                  Yesterday
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const weekAgo = subDays(today, 7);
                    setDateRange({ 
                      from: startOfDay(weekAgo), 
                      to: endOfDay(today) 
                    });
                  }}
                >
                  Last 7 Days
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateRange({
                      from: startOfMonth(new Date()),
                      to: endOfMonth(new Date())
                    });
                  }}
                >
                  This Month
                </Button>
              </div>
              <DateRangePicker
                value={dateRange}
                onChange={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to });
                  } else {
                    setDateRange(undefined);
                  }
                }}
              />
            </div>

            {/* Enhanced Leaderboard Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>
                      {leaderboardType === 'sales' ? 'Salesman' :
                       leaderboardType === 'confirmation' ? 'Confirmation User' :
                       leaderboardType === 'performance' ? 'Performer' :
                       leaderboardType === 'cities' ? 'City' :
                       leaderboardType === 'delivery' ? 'Delivery Service' :
                       leaderboardType === 'products' ? 'Product' :
                       'Product'}
                    </TableHead>
                    <TableHead>Performance</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>
                      {leaderboardType === 'sales' ? 'Orders' :
                       leaderboardType === 'confirmation' ? 'Success Rate' :
                       leaderboardType === 'performance' ? 'Efficiency' :
                       leaderboardType === 'cities' ? 'Orders' :
                       leaderboardType === 'delivery' ? 'Orders' :
                       leaderboardType === 'products' ? 'Quantity' :
                       'Quantity'}
                    </TableHead>
                    {leaderboardType === 'sales' && <TableHead>Commission</TableHead>}
                    {leaderboardType === 'confirmation' && <TableHead>Avg Time</TableHead>}
                    {leaderboardType === 'performance' && <TableHead>Achievements</TableHead>}
                    <TableHead>Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLeaderboardData
                    .filter(item => 
                      item.name.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((item, index) => {
                      const getPerformanceValue = () => {
                        switch (leaderboardType) {
                          case 'sales':
                            if (isSalesItem(item)) return `${(item as SalesLeaderboardItem).avgOrderValue.toFixed(0)} AOV`;
                            break;
                          case 'confirmation':
                            if (isConfirmationItem(item)) return `${(item as ConfirmationLeaderboardItem).successRate.toFixed(1)}%`;
                            break;
                          case 'performance':
                            if (isPerformanceItem(item)) return `${(item as PerformanceLeaderboardItem).efficiency.toFixed(1)}%`;
                            break;
                          case 'cities':
                            if (isCityItem(item)) return `${(item as CityLeaderboardItem).avgOrderValue.toFixed(0)} AOV`;
                            break;
                          case 'delivery':
                            if (isDeliveryItem(item)) return `${(item as DeliveryLeaderboardItem).successRate.toFixed(1)}%`;
                            break;
                          case 'products':
                            if (isProductItem(item)) return `${(item as ProductLeaderboardItem).profitMargin.toFixed(1)}% margin`;
                            break;
                          case 'returns':
                            if (isReturnItem(item)) return `${(item as ReturnLeaderboardItem).returnRate.toFixed(1)}%`;
                            break;
                        }
                        return 'N/A';
                      };

                      const getSecondaryValue = () => {
                        switch (leaderboardType) {
                          case 'sales':
                            if (isSalesItem(item)) return (item as SalesLeaderboardItem).orders;
                            break;
                          case 'confirmation':
                            if (isConfirmationItem(item)) return (item as ConfirmationLeaderboardItem).orders;
                            break;
                          case 'performance':
                            if (isPerformanceItem(item)) return (item as PerformanceLeaderboardItem).orders;
                            break;
                          case 'cities':
                            if (isCityItem(item)) return (item as CityLeaderboardItem).orders;
                            break;
                          case 'delivery':
                            if (isDeliveryItem(item)) return (item as DeliveryLeaderboardItem).orders;
                            break;
                          case 'products':
                            if (isProductItem(item)) return (item as ProductLeaderboardItem).quantity;
                            break;
                          case 'returns':
                            if (isReturnItem(item)) return (item as ReturnLeaderboardItem).quantity;
                            break;
                        }
                        return 0;
                      };

                      const getCommission = () => {
                        if (leaderboardType === 'sales' && isSalesItem(item)) {
                          return (item as SalesLeaderboardItem).commission;
                        }
                        return 0;
                      };

                      const getAchievements = () => {
                        if (leaderboardType === 'performance' && isPerformanceItem(item)) {
                          return (item as PerformanceLeaderboardItem).achievements;
                        }
                        if (leaderboardType === 'sales' && isSalesItem(item)) {
                          return (item as SalesLeaderboardItem).achievements || [];
                        }
                        return [];
                      };

                      const getAvgTime = () => {
                        if (leaderboardType === 'confirmation' && isConfirmationItem(item)) {
                          return `${(item as ConfirmationLeaderboardItem).avgProcessingTime}h`;
                        }
                        return 'N/A';
                      };

                      return (
                        <TableRow key={index} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getRankIcon(index + 1)}
                              <Badge variant="outline" className="font-bold">
                                #{index + 1}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {item.name}
                              {index < 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{getPerformanceValue()}</div>
                            {leaderboardType === 'sales' && isSalesItem(item) && (
                              <div className="text-xs text-muted-foreground">
                                {(item as SalesLeaderboardItem).conversionRate}% conversion
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-bold">MAD {item.value.toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="text-sm">{getSecondaryValue()}</div>
                            {leaderboardType === 'sales' && isSalesItem(item) && (
                              <div className="text-xs text-muted-foreground">
                                {(item as SalesLeaderboardItem).streak} day streak
                              </div>
                            )}
                          </TableCell>
                          {leaderboardType === 'sales' && isSalesItem(item) && (
                            <TableCell>MAD {getCommission().toFixed(2)}</TableCell>
                          )}
                          {leaderboardType === 'confirmation' && isConfirmationItem(item) && (
                            <TableCell>{getAvgTime()}</TableCell>
                          )}
                          {leaderboardType === 'performance' && isPerformanceItem(item) && (
                            <TableCell>
                              <div className="flex gap-1">
                                {getAchievements().slice(0, 3).map((achievement, idx) => (
                                  <div key={idx} title={achievement}>
                                    {getAchievementIcon(achievement)}
                                  </div>
                                ))}
                                {getAchievements().length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{getAchievements().length - 3}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getTrendIcon(item.trend || 'stable')}
                              <span className="text-xs text-muted-foreground">
                                {item.change && item.change > 0 ? '+' : ''}{item.change || 0}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
          </Table>
        </div>

            {/* Pagination */}
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="charts" className="space-y-4">
            {/* Analytics Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sales Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>7-Day Sales Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getTrendData()}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="sales" stroke="#8884d8" strokeWidth={2} />
                        <Line type="monotone" dataKey="orders" stroke="#82ca9d" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Sales Distribution Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Sales Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={getSalesDistributionData()}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {getSalesDistributionData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Performance Metrics Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Team Performance Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={leaderboardData.slice(0, 5)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="value" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Goals Progress Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Goals Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {goals.map((goal) => (
                      <div key={goal.id} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{goal.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {goal.current}/{goal.target}
                          </span>
                        </div>
                        <Progress value={(goal.current / goal.target) * 100} />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Deadline: {format(new Date(goal.deadline), 'MMM dd, yyyy')}</span>
                          <Badge variant={goal.priority === 'high' ? 'destructive' : goal.priority === 'medium' ? 'default' : 'secondary'}>
                            {goal.priority}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="goals" className="space-y-4">
            {/* Goals and Achievements */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Goals Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Team Goals
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {goals.map((goal) => (
                    <div key={goal.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-medium">{goal.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            Target: {goal.target.toLocaleString()} {goal.type}
                          </p>
                        </div>
                        <Badge variant={goal.priority === 'high' ? 'destructive' : goal.priority === 'medium' ? 'default' : 'secondary'}>
                          {goal.priority}
                        </Badge>
                      </div>
                      <Progress value={(goal.current / goal.target) * 100} className="mb-2" />
                      <div className="flex justify-between text-sm">
                        <span>Progress: {((goal.current / goal.target) * 100).toFixed(1)}%</span>
                        <span>Due: {format(new Date(goal.deadline), 'MMM dd')}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Achievements Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Achievements
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {achievements.map((achievement) => (
                    <div key={achievement.id} className={`p-4 border rounded-lg ${achievement.earned ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${achievement.earned ? 'bg-green-100' : 'bg-gray-100'}`}>
                          {getAchievementIcon(achievement.icon)}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium">{achievement.name}</h3>
                          <p className="text-sm text-muted-foreground">{achievement.description}</p>
                          <div className="mt-2">
                            <Progress value={(achievement.progress / achievement.target) * 100} className="mb-1" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{achievement.progress}/{achievement.target}</span>
                              <span>{achievement.reward}</span>
                            </div>
                          </div>
                        </div>
                        {achievement.earned && (
                          <Badge className="bg-green-100 text-green-800">
                            Earned
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="compare" className="space-y-4">
            {/* Comparison Mode Selection */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Compare:</span>
                <Select value={compareMode} onValueChange={(value: 'users' | 'teams') => setCompareMode(value)}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="users">Users</SelectItem>
                    <SelectItem value="teams">Teams</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={clearComparison}>
                Clear Selection
              </Button>
            </div>

            {/* Selection Interface */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Available Options */}
              <Card>
                <CardHeader>
                  <CardTitle>
                    Select {compareMode === 'users' ? 'Users' : 'Teams'} to Compare
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Choose 2 or more {compareMode === 'users' ? 'users' : 'teams'} to compare their performance
                  </p>
                </CardHeader>
                <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                  {(compareMode === 'users' ? getAvailableUsers() : getAvailableTeams()).map((name) => {
                    const isSelected = compareMode === 'users' ? 
                      selectedUsers.includes(name) : selectedTeams.includes(name);
                    return (
                      <div key={name} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted">
                        <input
                          type="checkbox"
                          id={name}
                          checked={isSelected}
                          onChange={(e) => {
                            if (compareMode === 'users') {
                              handleUserSelection(name, e.target.checked);
                            } else {
                              handleTeamSelection(name, e.target.checked);
                            }
                          }}
                          className="rounded"
                        />
                        <label htmlFor={name} className="flex-1 cursor-pointer">
                          {name}
                        </label>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Selected Options */}
              <Card>
                <CardHeader>
                  <CardTitle>
                    Selected {compareMode === 'users' ? 'Users' : 'Teams'} 
                    <Badge variant="secondary" className="ml-2">
                      {compareMode === 'users' ? selectedUsers.length : selectedTeams.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {compareMode === 'users' ? (
                    selectedUsers.length > 0 ? (
                      <div className="space-y-2">
                        {selectedUsers.map((name) => (
                          <div key={name} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                            <span>{name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUserSelection(name, false)}
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No users selected</p>
                    )
                  ) : (
                    selectedTeams.length > 0 ? (
                      <div className="space-y-2">
                        {selectedTeams.map((name) => (
                          <div key={name} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                            <span>{name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTeamSelection(name, false)}
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No teams selected</p>
                    )
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Comparison Results */}
            {comparisonData.length >= 2 && (
              <div className="space-y-6">
                {/* Comparison Metrics Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Comparison</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Side-by-side comparison of {compareMode === 'users' ? 'user' : 'team'} performance
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Metric</TableHead>
                            {comparisonData.map((item) => (
                              <TableHead key={item.name} className="text-center">
                                {item.name}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Total Sales</TableCell>
                            {comparisonData.map((item) => (
                              <TableCell key={item.name} className="text-center">
                                MAD {item.totalSales.toFixed(2)}
                              </TableCell>
                            ))}
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Total Orders</TableCell>
                            {comparisonData.map((item) => (
                              <TableCell key={item.name} className="text-center">
                                {item.totalOrders}
                              </TableCell>
                            ))}
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Average Order Value</TableCell>
                            {comparisonData.map((item) => (
                              <TableCell key={item.name} className="text-center">
                                MAD {item.avgOrderValue.toFixed(2)}
                              </TableCell>
                            ))}
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Success Rate</TableCell>
                            {comparisonData.map((item) => (
                              <TableCell key={item.name} className="text-center">
                                {item.successRate.toFixed(1)}%
                              </TableCell>
                            ))}
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Commission</TableCell>
                            {comparisonData.map((item) => (
                              <TableCell key={item.name} className="text-center">
                                MAD {item.totalCommission.toFixed(2)}
                              </TableCell>
                            ))}
                          </TableRow>
                          {compareMode === 'users' && (
                            <TableRow>
                              <TableCell className="font-medium">Current Streak</TableCell>
                              {comparisonData.map((item) => (
                                <TableCell key={item.name} className="text-center">
                                  {item.streak} days
                                </TableCell>
                              ))}
                            </TableRow>
                          )}
                          {compareMode === 'teams' && (
                            <>
                              <TableRow>
                                <TableCell className="font-medium">Team Size</TableCell>
                                {comparisonData.map((item) => (
                                  <TableCell key={item.name} className="text-center">
                                    {item.teamSize} members
                                  </TableCell>
                                ))}
                              </TableRow>
                              <TableRow>
                                <TableCell className="font-medium">Efficiency</TableCell>
                                {comparisonData.map((item) => (
                                  <TableCell key={item.name} className="text-center">
                                    {item.efficiency.toFixed(1)} orders/day
                                  </TableCell>
                                ))}
                              </TableRow>
                            </>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Comparison Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Sales Comparison Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Sales Comparison</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip formatter={(value) => [`MAD ${Number(value).toFixed(2)}`, 'Sales']} />
                            <Bar dataKey="totalSales" fill="#8884d8" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Orders Comparison Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Orders Comparison</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="totalOrders" fill="#82ca9d" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Success Rate Comparison */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Success Rate Comparison</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis domain={[0, 100]} />
                            <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Success Rate']} />
                            <Bar dataKey="successRate" fill="#ffc658" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Average Order Value Comparison */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Average Order Value Comparison</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip formatter={(value) => [`MAD ${Number(value).toFixed(2)}`, 'AOV']} />
                            <Bar dataKey="avgOrderValue" fill="#ff7300" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Performance Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {comparisonData.reduce((max, item) => 
                            item.totalSales > max.totalSales ? item : max
                          ).name}
                        </div>
                        <div className="text-sm text-muted-foreground">Top Sales Performer</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {comparisonData.reduce((max, item) => 
                            item.totalOrders > max.totalOrders ? item : max
                          ).name}
                        </div>
                        <div className="text-sm text-muted-foreground">Most Orders</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">
                          {comparisonData.reduce((max, item) => 
                            item.successRate > max.successRate ? item : max
                          ).name}
                        </div>
                        <div className="text-sm text-muted-foreground">Highest Success Rate</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* No Selection Message */}
            {comparisonData.length < 2 && (
              <Card>
                <CardContent className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Comparison Selected</h3>
                  <p className="text-muted-foreground">
                    Select 2 or more {compareMode === 'users' ? 'users' : 'teams'} to see their performance comparison
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
} 