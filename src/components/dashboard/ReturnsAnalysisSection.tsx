import { MapPin, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DashboardReturnCity, DashboardReturnsPoint } from "@/hooks/useApi";

interface ReturnsAnalysisSectionProps {
  year: number;
  returnsByMonth: DashboardReturnsPoint[];
  topReturnCities: DashboardReturnCity[];
  returnedThisYear: number;
}

export function ReturnsAnalysisSection({
  year,
  returnsByMonth,
  topReturnCities,
  returnedThisYear,
}: ReturnsAnalysisSectionProps) {
  const maxCityCount = topReturnCities[0]?.count ?? 1;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Returns analysis — {year}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Monitor return trends and high-risk cities for new orders
          </p>
        </div>
        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
          {returnedThisYear} return{returnedThisYear !== 1 ? "s" : ""} this year
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Returned orders by month
            </CardTitle>
            <CardDescription>
              All returned orders in {year}, grouped by month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={returnsByMonth}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [
                      `${value} order${value !== 1 ? "s" : ""}`,
                      "Returns",
                    ]}
                  />
                  <Bar
                    dataKey="returns"
                    name="Returns"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Top cities with returns
            </CardTitle>
            <CardDescription>
              Cities to watch when confirming new orders in {year}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  <TableHead className="w-10 font-medium">#</TableHead>
                  <TableHead className="font-medium">City</TableHead>
                  <TableHead className="text-right font-medium">Returns</TableHead>
                  <TableHead className="w-28 font-medium">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topReturnCities.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No returned orders recorded this year.
                    </TableCell>
                  </TableRow>
                ) : (
                  topReturnCities.map((item, index) => {
                    const ratio = item.count / maxCityCount;
                    const risk =
                      ratio >= 0.7 ? "high" : ratio >= 0.4 ? "medium" : "low";

                    return (
                      <TableRow key={item.city}>
                        <TableCell className="font-medium text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 font-medium">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {item.city}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {item.count}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              risk === "high"
                                ? "bg-red-100 text-red-800 hover:bg-red-100"
                                : risk === "medium"
                                  ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                                  : "bg-gray-100 text-gray-700 hover:bg-gray-100"
                            }
                          >
                            {risk}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
