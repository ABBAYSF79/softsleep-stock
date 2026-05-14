import { useCallback, useMemo, useState } from "react";

export type RowId = number;

export function toggleInSet<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function addManyToSet<T>(set: ReadonlySet<T>, values: readonly T[]): Set<T> {
  const next = new Set(set);
  for (const v of values) next.add(v);
  return next;
}

export function removeManyFromSet<T>(set: ReadonlySet<T>, values: readonly T[]): Set<T> {
  const next = new Set(set);
  for (const v of values) next.delete(v);
  return next;
}

export function useRowSelection<T extends RowId>() {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(() => new Set());

  const clear = useCallback(() => {
    setSelectedIds((prev) => (prev.size ? new Set() : prev));
  }, []);

  const toggleOne = useCallback((id: T) => {
    setSelectedIds((prev) => toggleInSet(prev, id));
  }, []);

  const setManySelected = useCallback((ids: readonly T[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = selected ? addManyToSet(prev, ids) : removeManyFromSet(prev, ids);
      if (next.size === prev.size) return prev;
      return next;
    });
  }, []);

  const api = useMemo(
    () => ({
      selectedIds,
      clear,
      toggleOne,
      setManySelected,
    }),
    [selectedIds, clear, toggleOne, setManySelected]
  );

  return api;
}

