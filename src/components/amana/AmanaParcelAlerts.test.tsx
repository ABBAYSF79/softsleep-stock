import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AmanaParcelAlert, AmanaParcelAlertsResponse } from "@/hooks/useApi";
import { AmanaParcelAlerts } from "@/components/amana/AmanaParcelAlerts";

const HOUR = 60 * 60 * 1000;

function alert(
  orderId: number,
  severity: AmanaParcelAlert["severity"],
  hours: number,
  trackingCode: string
): AmanaParcelAlert {
  return {
    orderId,
    customerName: `Client ${orderId}`,
    city: "Rabat",
    trackingCode,
    status: { code: "SORTI_A_DESTINATION", label: "Envoi sorti à destination" },
    lastUpdateAt: "2026-11-13T07:00:00.000Z",
    lastUpdateSource: "history",
    elapsedMs: hours * HOUR,
    severity,
    suggestedAction: `Action ${orderId}`,
  };
}

const response: AmanaParcelAlertsResponse = {
  referenceAt: "2026-11-16T15:00:00.000Z",
  counts: { CRITICAL: 2, WARNING: 1, INFO: 1, total: 4 },
  data: [
    alert(11, "CRITICAL", 80, "CRIT80MA"),
    alert(12, "CRITICAL", 73, "CRIT73MA"),
    alert(21, "WARNING", 55, "WARN55MA"),
    alert(31, "INFO", 30, "INFO30MA"),
  ],
};

const emptyResponse: AmanaParcelAlertsResponse = {
  referenceAt: response.referenceAt,
  counts: { CRITICAL: 0, WARNING: 0, INFO: 0, total: 0 },
  data: [],
};

function renderCenter(alerts = response, onOpenOrder = vi.fn()) {
  render(<AmanaParcelAlerts alerts={alerts} onOpenOrder={onOpenOrder} />);
  return { onOpenOrder };
}

const bar = () => screen.getByRole("button", { name: /^Centre de notifications/ });
const list = () => screen.getByRole("list", { name: "Liste des alertes" });

async function openDrawer() {
  const user = userEvent.setup();
  await user.click(bar());
  const dialog = await screen.findByRole("dialog");
  return { user, dialog };
}

describe("AmanaParcelAlerts notification center", () => {
  it("shows a compact summary bar with total and severity counts, without alert rows", () => {
    renderCenter();
    expect(bar()).toHaveAccessibleName(/4 alertes/);
    expect(bar()).toHaveTextContent("Critiques2");
    expect(bar()).toHaveTextContent("Attention1");
    expect(bar()).toHaveTextContent("Info1");
    expect(bar()).toHaveTextContent("Voir les alertes");
    expect(screen.getByTestId("critical-indicator")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("CRIT80MA")).not.toBeInTheDocument();
  });

  it("hides the critical indicator when there are no critical alerts", () => {
    renderCenter(emptyResponse);
    expect(screen.queryByTestId("critical-indicator")).not.toBeInTheDocument();
    expect(bar()).toHaveAccessibleName(/0 alertes/);
  });

  it("opens a drawer listing every alert once with all details", async () => {
    renderCenter();
    const { dialog } = await openDrawer();
    expect(within(dialog).getByText("Centre de notifications")).toBeInTheDocument();
    const rows = within(list()).getAllByRole("listitem");
    expect(rows).toHaveLength(4);

    const row = rows[0];
    expect(within(row).getByText("CRIT80MA")).toBeInTheDocument();
    expect(within(row).getByText("Rabat")).toBeInTheDocument();
    expect(within(row).getByText("Envoi sorti à destination")).toBeInTheDocument();
    expect(within(row).getByText("Critique")).toBeInTheDocument();
    expect(within(row).getByText("3 j 8 h")).toBeInTheDocument();
    expect(within(row).getByText(/\d{2}\/11\/2026 \d{2}:\d{2}/)).toBeInTheDocument();
    expect(within(row).getByText("Action 11")).toBeInTheDocument();
  });

  it("filters by severity tab and returns to all", async () => {
    renderCenter();
    const { user, dialog } = await openDrawer();
    const tabs = within(within(dialog).getByRole("group", { name: "Filtrer par niveau" }));

    await user.click(tabs.getByRole("button", { name: /^Critiques/ }));
    expect(tabs.getByRole("button", { name: /^Critiques/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(list()).getAllByRole("listitem").map((r) => r.dataset.severity)).toEqual([
      "CRITICAL",
      "CRITICAL",
    ]);

    await user.click(tabs.getByRole("button", { name: /^Info/ }));
    const rows = within(list()).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("INFO30MA")).toBeInTheDocument();

    await user.click(tabs.getByRole("button", { name: /^Toutes/ }));
    expect(within(list()).getAllByRole("listitem")).toHaveLength(4);
  });

  it("opens the matching order from an alert card", async () => {
    const { onOpenOrder } = renderCenter();
    const { user, dialog } = await openDrawer();
    const tabs = within(within(dialog).getByRole("group", { name: "Filtrer par niveau" }));
    await user.click(tabs.getByRole("button", { name: /^Attention/ }));
    await user.click(screen.getByRole("button", { name: "Voir la commande #21" }));
    expect(onOpenOrder).toHaveBeenCalledTimes(1);
    expect(onOpenOrder).toHaveBeenCalledWith(21);
  });

  it("closes the drawer with the close button", async () => {
    renderCenter();
    const { user, dialog } = await openDrawer();
    await user.click(within(dialog).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bar()).toBeInTheDocument();
  });

  it("shows an empty state in the drawer when there are no alerts", async () => {
    renderCenter(emptyResponse);
    await openDrawer();
    expect(screen.getByText(/Aucune alerte/)).toBeInTheDocument();
  });
});
