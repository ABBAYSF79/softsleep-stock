import { format } from "date-fns";
import { Award, CheckCircle2, Target } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { ConfirmationUserProgressResponse } from "@/hooks/useApi";

const OBJECTIVE = 50;

interface ConfirmationUser {
  id: number;
  name: string;
  active?: boolean;
}

interface ConfirmationObjectiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: ConfirmationUser[];
  progressData?: ConfirmationUserProgressResponse;
  isLoading?: boolean;
  isError?: boolean;
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

export const ConfirmationObjectiveDialog = ({
  open,
  onOpenChange,
  users,
  progressData,
  isLoading = false,
  isError = false,
}: ConfirmationObjectiveDialogProps) => {
  const target = Math.max(1, progressData?.objective ?? OBJECTIVE);
  const progressByUserId = new Map(
    (progressData?.users ?? []).map((progress) => [
      progress.confirmationUserId,
      progress.deliveredCount,
    ])
  );
  const sortedUsers = [...users].sort((a, b) => {
    const deliveredDifference =
      (progressByUserId.get(b.id) ?? 0) - (progressByUserId.get(a.id) ?? 0);

    return deliveredDifference || a.name.localeCompare(b.name);
  });
  const monthLabel = progressData?.month
    ? format(new Date(`${progressData.month}-01T12:00:00`), "MMMM yyyy")
    : "Current month";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl overflow-hidden rounded-2xl border-slate-200 p-0">
        <DialogHeader className="border-b border-slate-100 bg-slate-50/70 px-5 py-5 text-left sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-matles-100 text-matles-700">
              <Target className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg text-slate-900">
                Confirmation objectives
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-500">
                Monthly delivery performance for {monthLabel}, ranked by delivered orders.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[min(70vh,620px)] space-y-4 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Monthly target</p>
              <p className="mt-1 text-xs text-slate-500">
                Each confirmation user has a target of {target} delivered orders.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Target className="h-4 w-4 text-matles-600" aria-hidden="true" />
              {sortedUsers.length} user{sortedUsers.length === 1 ? "" : "s"}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3" aria-label="Loading objective progress">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Monthly objective progress is temporarily unavailable. Please try again later.
            </div>
          ) : sortedUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              No confirmation users are available.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedUsers.map((confirmationUser, index) => {
                const delivered = Math.max(
                  0,
                  progressByUserId.get(confirmationUser.id) ?? 0
                );
                const completionPercent = Math.min((delivered / target) * 100, 100);
                const remaining = Math.max(target - delivered, 0);
                const bonusOrders = Math.max(delivered - target, 0);
                const bonusPercent = Math.min((bonusOrders / target) * 100, 100);

                return (
                  <article
                    key={confirmationUser.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold tabular-nums text-slate-600">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                              {getInitials(confirmationUser.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">
                                {confirmationUser.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {delivered >= target
                                  ? bonusOrders > 0
                                    ? "Objective exceeded"
                                    : "Objective completed"
                                  : `${remaining} order${remaining === 1 ? "" : "s"} remaining`}
                              </p>
                            </div>
                          </div>
                          {bonusOrders > 0 ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              <Award className="h-3.5 w-3.5" aria-hidden="true" />
                              +{bonusOrders} bonus
                            </span>
                          ) : delivered >= target ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Complete
                            </span>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-medium text-slate-600">Objective progress</span>
                            <span className="font-semibold tabular-nums text-slate-700">
                              {delivered}/{target} · {Math.round(completionPercent)}%
                            </span>
                          </div>
                          <Progress
                            value={completionPercent}
                            className="h-2 bg-slate-100"
                            aria-label={`${confirmationUser.name} objective progress`}
                          />
                        </div>

                        {bonusOrders > 0 && (
                          <div className="space-y-2 border-t border-amber-100 pt-3">
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className="font-medium text-amber-800">
                                Bonus / Premium progress
                              </span>
                              <span className="font-semibold tabular-nums text-amber-800">
                                +{bonusOrders}
                              </span>
                            </div>
                            <Progress
                              value={bonusPercent}
                              className="h-2 bg-amber-100 [&>div]:bg-amber-500"
                              aria-label={`${confirmationUser.name} bonus progress`}
                            />
                            <p className="text-xs text-amber-800/80">
                              Eligible for a premium review based on over-target performance.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
