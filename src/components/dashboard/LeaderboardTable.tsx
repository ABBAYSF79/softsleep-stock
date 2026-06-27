import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardLeader } from "@/hooks/useApi";

interface LeaderboardTableProps {
  title: string;
  leaders: DashboardLeader[];
  showRevenue?: boolean;
  emptyMessage?: string;
}

const formatMad = (amount: number) =>
  `${amount.toLocaleString("fr-MA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MAD`;

export function LeaderboardTable({
  title,
  leaders,
  showRevenue = true,
  emptyMessage = "No data for this month yet.",
}: LeaderboardTableProps) {
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className="w-10 font-medium">#</TableHead>
              <TableHead className="font-medium">Name</TableHead>
              <TableHead className="text-right font-medium">Delivered</TableHead>
              {showRevenue && (
                <TableHead className="text-right font-medium">Revenue</TableHead>
              )}
              <TableHead className="text-right font-medium">Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showRevenue ? 5 : 4}
                  className="py-10 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              leaders.map((leader, index) => (
                <TableRow key={leader.userId ?? leader.id ?? index}>
                  <TableCell className="font-medium text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{leader.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {leader.deliveredCount}
                  </TableCell>
                  {showRevenue && (
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatMad(leader.revenue)}
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatMad(leader.commission)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
