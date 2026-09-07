import { Link, useLocation } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { cn } from '@/lib/utils';
import { InventoryModeBanner } from './InventoryModeBanner';
import type { ReactNode } from 'react';

const TABS = [
  { to: '/inventory', label: 'Overview', exact: true },
  { to: '/inventory/stock', label: 'Stock' },
  { to: '/inventory/locations', label: 'Locations' },
  { to: '/inventory/transfers', label: 'Transfers' },
  { to: '/inventory/documents', label: 'Documents' },
  { to: '/inventory/reservations', label: 'Reservations' },
  { to: '/inventory/history', label: 'History' },
  { to: '/inventory/reconciliation', label: 'Reconciliation' },
  { to: '/inventory/cutover', label: 'Cutover' },
] as const;

interface InventoryLayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
}

export function InventoryLayout({ children, title, description, actions }: InventoryLayoutProps) {
  const location = useLocation();

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1400px] space-y-4">
        <InventoryModeBanner />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Accessoires
            </p>
            {title ? (
              <h2 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>

        <nav
          className="-mx-1 flex gap-1 overflow-x-auto border-b border-gray-200 pb-px"
          aria-label="Inventory sections"
        >
          {TABS.map((tab) => {
            const active = tab.exact
              ? location.pathname === tab.to
              : location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  'shrink-0 rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-b-2 border-matles-700 text-matles-800'
                    : 'text-muted-foreground hover:text-gray-900'
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </MainLayout>
  );
}
