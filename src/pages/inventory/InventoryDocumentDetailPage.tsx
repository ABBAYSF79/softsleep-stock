import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { useInventoryDocumentQuery } from '@/features/inventory/hooks/useInventoryQueries';
import {
  documentStatusLabel,
  documentTypeLabel,
  locationDisplayName,
} from '@/features/inventory/utils/labels';
import { downloadInventoryDocumentPdf } from '@/features/inventory/utils/document-pdf';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function InventoryDocumentDetailPage() {
  const { id } = useParams();
  const docId = Number(id);
  const { data: doc, isLoading, error } = useInventoryDocumentQuery(docId);
  const printRef = useRef<HTMLElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    if (!printRef.current || !doc) return;
    try {
      setDownloading(true);
      await downloadInventoryDocumentPdf(printRef.current, doc.documentNumber);
      toast.success('PDF downloaded');
    } catch (e) {
      console.error(e);
      toast.error('Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <InventoryLayout title="Document">
        <Skeleton className="h-96 w-full" />
      </InventoryLayout>
    );
  }

  if (error || !doc) {
    return (
      <InventoryLayout title="Document">
        <p className="text-sm text-red-600">Document not found.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/inventory/documents">Back</Link>
        </Button>
      </InventoryLayout>
    );
  }

  return (
    <InventoryLayout
      title={doc.documentNumber}
      description={documentTypeLabel(doc.type)}
      actions={
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button asChild variant="outline" size="sm">
            <Link to="/inventory/documents">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />
            Print
          </Button>
          <Button size="sm" disabled={downloading} onClick={() => void handleDownloadPdf()}>
            <Download className="mr-1 h-4 w-4" />
            {downloading ? 'Preparing…' : 'Download PDF'}
          </Button>
        </div>
      }
    >
      <article
        ref={printRef}
        className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow-none print:border-0 print:shadow-none"
      >
        <header className="border-b border-gray-100 pb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            SoftSleep · Matelas Stock
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{doc.documentNumber}</h2>
          <p className="text-sm text-muted-foreground">
            {documentTypeLabel(doc.type)} · {documentStatusLabel(doc.status)}
          </p>
        </header>

        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Transfer</dt>
            <dd className="font-medium">
              {doc.transfer ? (
                <Link
                  to={`/inventory/transfers/${doc.transfer.id}`}
                  className="text-matles-800 hover:underline print:text-foreground"
                >
                  {doc.transfer.referenceNumber}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd className="font-medium">
              {doc.location
                ? locationDisplayName(doc.location.code, doc.location.name)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created by</dt>
            <dd className="font-medium">{doc.createdBy?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Validated by</dt>
            <dd className="font-medium">{doc.validatedBy?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-medium">{new Date(doc.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Validated</dt>
            <dd className="font-medium">
              {doc.validatedAt ? new Date(doc.validatedAt).toLocaleString() : '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold">Lines</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Accessoire</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.pillow?.name ?? `#${line.pillowId}`}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {line.quantity}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <footer className="mt-10 grid gap-8 border-t border-gray-100 pt-6 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Prepared by</p>
            <p className="mt-8 border-b border-dashed border-gray-300 pb-1">
              {doc.createdBy?.name ?? ''}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Validated by</p>
            <p className="mt-8 border-b border-dashed border-gray-300 pb-1">
              {doc.validatedBy?.name ?? ''}
            </p>
          </div>
        </footer>
      </article>
    </InventoryLayout>
  );
}
