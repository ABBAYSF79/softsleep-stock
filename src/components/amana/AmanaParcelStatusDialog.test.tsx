import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AmanaManagementOrderRow } from "@/hooks/useApi";
import { AmanaParcelStatusDialog } from "@/components/amana/AmanaParcelStatusDialog";
import { AmanaParcelCard } from "@/components/amana/AmanaParcelCard";

const statuses = [
  { code: "SORTI_A_DESTINATION", label: "Envoi sorti à destination", color: "blue" },
  { code: "ENVOI_ARRIVE", label: "Envoi arrivé", color: "purple" },
];

const baseOrder: AmanaManagementOrderRow = {
  id: 42,
  customerName: "Client 42",
  phone: "0611111111",
  city: "Rabat",
  address: "Rue 1",
  trackingCode: "QD000042MA",
  createdAt: "2026-11-10T10:00:00.000Z",
  inProcessAt: "2026-11-11T10:00:00.000Z",
  orderStatus: "IN_PROCESS",
  deliveryService: null,
  amanaTracking: null,
};

const trackedOrder: AmanaManagementOrderRow = {
  ...baseOrder,
  amanaTracking: {
    id: 1,
    status: statuses[1],
    initialStatusAt: "2026-11-11T10:00:00.000Z",
    lastStatusAt: "2026-11-12T10:00:00.000Z",
  },
};

function renderDialog(order: AmanaManagementOrderRow, canMutate = true) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <AmanaParcelStatusDialog
      open
      onOpenChange={vi.fn()}
      order={order}
      statuses={statuses}
      canMutate={canMutate}
      isSaving={false}
      onSubmit={onSubmit}
    />
  );
  return { onSubmit };
}

describe("AmanaParcelStatusDialog initialization mode", () => {
  it("lets an uninitialized order be initialized with a status and note", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog(baseOrder);

    expect(screen.getByText("Initialiser le suivi Amana")).toBeInTheDocument();
    expect(screen.getByLabelText("Statut initial")).not.toBeDisabled();
    expect(screen.getByLabelText("Statut initial")).toHaveTextContent("Envoi sorti à destination");

    await user.type(screen.getByLabelText("Note (optionnelle)"), "Colis déposé");
    await user.click(screen.getByRole("button", { name: "Initialiser" }));

    expect(onSubmit).toHaveBeenCalledWith({
      orderId: 42,
      status: "SORTI_A_DESTINATION",
      note: "Colis déposé",
    });
  });

  it("keeps the regular update mode for tracked orders", () => {
    renderDialog(trackedOrder);
    expect(screen.getByText("Statut Amana")).toBeInTheDocument();
    expect(screen.getByLabelText("Nouveau statut")).toHaveTextContent("Envoi arrivé");
    expect(screen.getByRole("button", { name: "Confirmer" })).toBeEnabled();
  });

  it("stays read-only for roles that cannot mutate", () => {
    renderDialog(baseOrder, false);
    expect(screen.getByLabelText("Statut initial")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Initialiser" })).toBeDisabled();
  });
});

describe("AmanaParcelCard initialization action", () => {
  function renderCard(order: AmanaManagementOrderRow, canMutateStatus = true) {
    const onUpdateStatus = vi.fn();
    render(
      <TooltipProvider>
        <AmanaParcelCard
          order={order}
          statusCatalog={statuses}
          canMutateStatus={canMutateStatus}
          onViewDetails={vi.fn()}
          onViewHistory={vi.fn()}
          onUpdateStatus={onUpdateStatus}
          onOpenBarcode={vi.fn()}
          onCopyTracking={vi.fn()}
        />
      </TooltipProvider>
    );
    return { onUpdateStatus };
  }

  it("shows an enabled 'Initialiser le suivi' button on uninitialized cards", async () => {
    const user = userEvent.setup();
    const { onUpdateStatus } = renderCard(baseOrder);
    const button = screen.getByRole("button", { name: /Initialiser le suivi/ });
    expect(button).toBeEnabled();
    expect(screen.getByRole("button", { name: /Historique/ })).toBeDisabled();
    await user.click(button);
    expect(onUpdateStatus).toHaveBeenCalledTimes(1);
  });

  it("keeps 'Modifier le statut' for tracked cards", () => {
    renderCard(trackedOrder);
    expect(screen.getByRole("button", { name: /Modifier le statut/ })).toBeEnabled();
  });

  it("hides the initialize action when the user cannot mutate", () => {
    renderCard(baseOrder, false);
    expect(screen.queryByRole("button", { name: /Initialiser le suivi/ })).not.toBeInTheDocument();
  });
});
