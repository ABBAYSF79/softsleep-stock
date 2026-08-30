import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Package2,
  ShoppingCart,
  CircleDollarSign,
  DollarSign,
  Users,
  Clock,
  Truck,
  CheckCircle2,
  RotateCcw,
  TrendingUp,
  Wallet,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useDashboard } from "@/hooks/useApi";
import { DashboardStatCard } from "@/components/dashboard/DashboardStatCard";
import { LeaderboardTable } from "@/components/dashboard/LeaderboardTable";
import { ReturnsAnalysisSection } from "@/components/dashboard/ReturnsAnalysisSection";
import { ORDER_STATUSES } from "@/utils/order-utils";
import { Badge } from "@/components/ui/badge";

const formatAmount = (amount: number | string | null | undefined) => {
  const num = Number(amount ?? 0);
  if (!Number.isFinite(num)) return "MAD 0";
  return `MAD ${num.toLocaleString("fr-MA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const getStatusBadge = (status: string) => {
  const config = ORDER_STATUSES[status as keyof typeof ORDER_STATUSES];
  if (!config) return <Badge variant="outline">{status}</Badge>;
  return <Badge className={config.color}>{config.label}</Badge>;
};

function DashboardSkeleton() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    </MainLayout>
  );
}

const Dashboard = () => {
  const { data, isLoading } = useDashboard();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const {
    stats,
    salesData = [],
    recentOrders = [],
    isAdmin,
    topSellers = [],
    topConfirmationUsers = [],
    returnsByMonth = [],
    topReturnCities = [],
    period,
  } = data ?? {};

  const periodLabel = period?.label ?? format(new Date(), "MMMM yyyy");

  const paidTotal =
    (stats?.paidDeliveredThisMonth ?? 0) +
    (stats?.unpaidDeliveredThisMonth ?? 0);
  const paidPercentage =
    paidTotal > 0
      ? Math.round(
          ((stats?.paidDeliveredThisMonth ?? 0) / paidTotal) * 100
        )
      : 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Matelas Stock
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Business overview · {periodLabel}
          </p>
        </div>

        {/* Row 1 — Today & month pulse */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <DashboardStatCard
            label="Orders today"
            value={stats?.ordersToday ?? 0}
            icon={<Clock className="h-4 w-4 text-matles-600" />}
            highlight
          />
          <DashboardStatCard
            label="Orders this month"
            value={stats?.orders ?? 0}
            icon={<ShoppingCart className="h-4 w-4 text-blue-600" />}
          />
          <DashboardStatCard
            label="Delivered this month"
            value={stats?.deliveredThisMonth ?? 0}
            icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
          />
          {isAdmin && (
            <DashboardStatCard
              label="Revenue this month"
              value={formatAmount(stats?.revenue)}
              icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
              subtext="Delivered orders only"
            />
          )}
          <DashboardStatCard
            label="Commission this month"
            value={formatAmount(stats?.commission)}
            icon={<CircleDollarSign className="h-4 w-4 text-violet-600" />}
            subtext="Delivered orders only"
          />
        </div>

        {/* Row 2 — Pipeline + admin inventory */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <DashboardStatCard
            label="Pending"
            value={stats?.pendingThisMonth ?? 0}
            icon={<Clock className="h-4 w-4 text-yellow-600" />}
          />
          <DashboardStatCard
            label="In process"
            value={stats?.inProcessThisMonth ?? 0}
            icon={<Truck className="h-4 w-4 text-blue-600" />}
          />
          <DashboardStatCard
            label="Delivered"
            value={stats?.deliveredThisMonth ?? 0}
            icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
          />
          <DashboardStatCard
            label="Returned"
            value={stats?.returnedThisMonth ?? 0}
            icon={<RotateCcw className="h-4 w-4 text-red-600" />}
          />
          {isAdmin && (
            <>
              <DashboardStatCard
                label="Total products"
                value={stats?.products ?? 0}
                icon={<Package2 className="h-4 w-4 text-gray-600" />}
              />
              <DashboardStatCard
                label="Total users"
                value={stats?.users ?? 0}
                icon={<Users className="h-4 w-4 text-gray-600" />}
              />
            </>
          )}
        </div>

        {/* Row 3 — Finance (admin) */}
        {isAdmin && (
          <div>
            <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Finance — delivered orders this month
              </h2>
              <Link
                to="/finance"
                className="text-xs font-medium text-matles-600 hover:text-matles-700"
              >
                View finance →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <DashboardStatCard
                label="Paid orders"
                value={stats?.paidDeliveredThisMonth ?? 0}
                icon={<CreditCard className="h-4 w-4 text-green-600" />}
                subtext={`${paidPercentage}% of delivered`}
              />
              <DashboardStatCard
                label="Unpaid orders"
                value={stats?.unpaidDeliveredThisMonth ?? 0}
                icon={<AlertCircle className="h-4 w-4 text-red-600" />}
              />
              <DashboardStatCard
                label="Paid revenue"
                value={formatAmount(stats?.paidRevenueThisMonth)}
                icon={<Wallet className="h-4 w-4 text-green-600" />}
              />
              <DashboardStatCard
                label="Unpaid revenue"
                value={formatAmount(stats?.unpaidRevenueThisMonth)}
                icon={<Wallet className="h-4 w-4 text-orange-600" />}
              />
              <DashboardStatCard
                label="Payment rate"
                value={`${paidPercentage}%`}
                icon={<TrendingUp className="h-4 w-4 text-matles-600" />}
              />
            </div>
          </div>
        )}

        {/* Row 4 — Leaders (admin) */}
        {isAdmin && (
          <div>
            <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Top performers — by delivered orders this month
              </h2>
              <div className="flex flex-wrap gap-x-3 gap-y-1 sm:gap-3">
                <Link
                  to="/sales"
                  className="text-xs font-medium text-matles-600 hover:text-matles-700"
                >
                  Sales overview →
                </Link>
                <Link
                  to="/team-overview-2"
                  className="text-xs font-medium text-matles-600 hover:text-matles-700"
                >
                  Team overview →
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <LeaderboardTable
                title="Top 5 seller users"
                leaders={topSellers}
                showRevenue
              />
              <LeaderboardTable
                title="Top 5 confirmation users"
                leaders={topConfirmationUsers}
                showRevenue
              />
            </div>
          </div>
        )}

        {/* Returns analysis — year chart + top cities */}
        <ReturnsAnalysisSection
          year={period?.year ?? new Date().getFullYear()}
          returnsByMonth={returnsByMonth}
          topReturnCities={topReturnCities}
          returnedThisYear={stats?.returnedThisYear ?? 0}
        />

        {/* Row 5 — Chart & recent orders */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-medium">
                {isAdmin
                  ? "Last 4 months: sales & commission"
                  : "Last 4 months: commission"}
              </CardTitle>
              <CardDescription>Delivered orders only</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={salesData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) =>
                        `${value.toLocaleString("fr-MA")} MAD`
                      }
                    />
                    <Legend />
                    {isAdmin && (
                      <Bar dataKey="sales" name="Sales" fill="#0ea5e9" />
                    )}
                    <Bar dataKey="commission" name="Commission" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Recent orders
              </CardTitle>
              <CardDescription>Latest 5 orders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentOrders.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No recent orders.
                  </p>
                ) : (
                  recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">
                          Order #{order.id}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {order.customerName}
                        </p>
                        {order.status && (
                          <div className="mt-1">{getStatusBadge(order.status)}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-medium tabular-nums">
                          {formatAmount(
                            isAdmin ? order.totalAmount : order.commission
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(order.createdAt), "dd MMM yyyy")}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
