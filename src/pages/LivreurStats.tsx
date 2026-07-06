import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LivreurLayout } from "@/components/layout/LivreurLayout";
import { LivreurStatsOverview } from "@/components/livreur/LivreurStatsOverview";
import { Button } from "@/components/ui/button";
import { useLivreurStats } from "@/hooks/useApi";

const LivreurStats = () => {
  const navigate = useNavigate();
  const [statsMonth, setStatsMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: livreurStats, isLoading, error, refetch, isRefetching } = useLivreurStats(statsMonth);

  const handleFilterOrders = useCallback(
    (status: string) => {
      navigate(`/livreur/orders?status=${status}`);
    },
    [navigate]
  );

  if (error) {
    return (
      <LivreurLayout title="Statistiques" onRefresh={() => refetch()} isRefreshing={isRefetching}>
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-base font-medium text-red-600">Erreur de chargement</p>
          <Button onClick={() => refetch()} variant="outline">
            Réessayer
          </Button>
        </div>
      </LivreurLayout>
    );
  }

  return (
    <LivreurLayout title="Statistiques" onRefresh={() => refetch()} isRefreshing={isRefetching}>
      <div className="space-y-4">
        <p className="px-1 text-sm text-muted-foreground">
          Suivi mensuel de vos livraisons. Touchez une carte pour voir les commandes.
        </p>
        <LivreurStatsOverview
          month={statsMonth}
          onMonthChange={setStatsMonth}
          stats={livreurStats}
          isLoading={isLoading}
          onFilterStatus={handleFilterOrders}
        />
      </div>
    </LivreurLayout>
  );
};

export default LivreurStats;
