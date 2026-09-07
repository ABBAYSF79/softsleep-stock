import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { InventoryEmptyState } from '@/features/inventory/components/InventoryEmptyState';
import { useInventoryDocumentsQuery } from '@/features/inventory/hooks/useInventoryQueries';
import {
  documentStatusLabel,
  documentTypeLabel,
  locationDisplayName,
} from '@/features/inventory/utils/labels';
import { useDebounce } from '@/hooks/useDebounce';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function InventoryDocumentsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'all';
  const status = params.get('status') ?? 'all';
  const q = params.get('q') ?? '';
  const debouncedQ = useDebounce(q, 300);

  const typeParam =
    tab === 'bs' ? 'BON_SORTIE' : tab === 'be' ? 'BON_ENTREE' : undefined;

  const { data: documents = [], isLoading } = useInventoryDocumentsQuery({
    ...(typeParam ? { type: typeParam } : {}),
    ...(status !== 'all' ? { status } : {}),
  });

  const filtered = useMemo(() => {
    const query = debouncedQ.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter((d) => {
      const num = d.documentNumber.toLowerCase();
      const tr = (d.transfer?.referenceNumber ?? '').toLowerCase();
      return num.includes(query) || tr.includes(query);
    });
  }, [documents, debouncedQ]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <InventoryLayout
      title="Documents"
      description="Official Bon de Sortie and Bon d'Entrée documents."
    >
      <Tabs value={tab} onValueChange={(v) => setFilter('tab', v === 'all' ? '' : v)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="bs">Bon de Sortie</TabsTrigger>
          <TabsTrigger value="be">Bon d&apos;Entrée</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="doc-search">Document / transfer</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="doc-search"
              className="pl-8"
              value={q}
              onChange={(e) => setFilter('q', e.target.value)}
              placeholder="BS-… / BE-… / TR-…"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setFilter('status', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="VALIDATED">Validated</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <InventoryEmptyState
          title="No documents yet"
          description="Documents appear when you dispatch or receive a transfer."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Transfer</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Validated At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link
                        to={`/inventory/documents/${d.id}`}
                        className="font-medium text-matles-800 hover:underline"
                      >
                        {d.documentNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{documentTypeLabel(d.type)}</TableCell>
                    <TableCell>
                      {d.transfer ? (
                        <Link
                          to={`/inventory/transfers/${d.transfer.id}`}
                          className="hover:underline"
                        >
                          {d.transfer.referenceNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {d.location
                        ? locationDisplayName(d.location.code, d.location.name)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{documentStatusLabel(d.status)}</Badge>
                    </TableCell>
                    <TableCell>{d.createdBy?.name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.validatedAt ? new Date(d.validatedAt).toLocaleString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((d) => (
              <Card key={d.id} className="border-gray-200 shadow-none">
                <CardContent className="space-y-1 p-4">
                  <Link
                    to={`/inventory/documents/${d.id}`}
                    className="font-semibold text-matles-800 hover:underline"
                  >
                    {d.documentNumber}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {documentTypeLabel(d.type)} · {documentStatusLabel(d.status)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </InventoryLayout>
  );
}
