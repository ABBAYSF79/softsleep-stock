import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  FollowUpTimeline,
  OrderFollowUpSheet,
  followUpAuthorInitials,
  formatFollowUpTimestamp,
} from "@/components/orders/OrderFollowUpSheet";

vi.mock("@/hooks/useApi", () => ({
  useOrderFollowUps: vi.fn(),
  useAddOrderFollowUp: vi.fn(),
}));

import { useAddOrderFollowUp, useOrderFollowUps } from "@/hooks/useApi";

const mockedUseOrderFollowUps = vi.mocked(useOrderFollowUps);
const mockedUseAddOrderFollowUp = vi.mocked(useAddOrderFollowUp);

const sampleOrder = {
  id: 1645,
  customerName: "reda",
  phone: "0690137708",
  city: "Casablanca",
  status: "PENDING",
};

describe("Suivi UI polish helpers", () => {
  it("builds compact author initials", () => {
    expect(followUpAuthorInitials("Ibrahim")).toBe("IB");
    expect(followUpAuthorInitials("Admin User")).toBe("AU");
    expect(followUpAuthorInitials("")).toBe("?");
  });

  it("formats timestamps for display", () => {
    const text = formatFollowUpTimestamp("2026-09-08T18:42:00.000Z");
    expect(text).toMatch(/Sep/);
    expect(text).toMatch(/·/);
  });
});

describe("FollowUpTimeline", () => {
  it("renders newest first and preserves multiline content", () => {
    render(
      <FollowUpTimeline
        items={[
          {
            id: 2,
            content: "line1\nline2",
            createdAt: "2026-09-08T18:42:00.000Z",
            orderId: 1645,
            pillowOrderId: null,
            userId: 1,
            userName: "Ibrahim",
          },
          {
            id: 1,
            content: "older",
            createdAt: "2026-09-08T18:41:00.000Z",
            orderId: 1645,
            pillowOrderId: null,
            userId: 2,
            userName: "Admin",
          },
        ]}
      />
    );

    const nodes = screen.getAllByTestId("suivi-timeline-item");
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toHaveTextContent("Ibrahim");
    expect(nodes[0]).toHaveTextContent("line1");
    expect(nodes[0].querySelector("p.whitespace-pre-wrap")?.textContent).toBe(
      "line1\nline2"
    );
    expect(nodes[1]).toHaveTextContent("Admin");
  });
});

describe("OrderFollowUpSheet compact drawer", () => {
  const mutate = vi.fn();

  beforeEach(() => {
    mutate.mockReset();
    mockedUseAddOrderFollowUp.mockReturnValue({
      mutate,
      isPending: false,
    } as any);
  });

  it("renders compact header meta, status, textarea and empty history", () => {
    mockedUseOrderFollowUps.mockReturnValue({
      data: { orderId: 1645, items: [] },
      isLoading: false,
      isError: false,
    } as any);

    render(
      <OrderFollowUpSheet open onOpenChange={() => undefined} order={sampleOrder} />
    );

    expect(screen.getByTestId("suivi-order-id")).toHaveTextContent("#1645");
    expect(screen.getByTestId("suivi-order-meta")).toHaveTextContent("reda");
    expect(screen.getByTestId("suivi-order-meta")).toHaveTextContent(
      "0690137708 · Casablanca"
    );
    expect(screen.getByTestId("suivi-status")).toHaveTextContent("Pending");
    expect(
      screen.queryByText(/Journal libre|indépendant de la Note/i)
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Ajouter un suivi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter le suivi" })).toBeInTheDocument();
    expect(screen.getByTestId("suivi-empty")).toHaveTextContent(
      "Aucun suivi pour cette commande."
    );
  });

  it("renders timeline history when items exist", () => {
    mockedUseOrderFollowUps.mockReturnValue({
      data: {
        orderId: 1645,
        items: [
          {
            id: 9,
            content: "raha khedaha lyoma",
            createdAt: "2026-09-08T18:42:00.000Z",
            orderId: 1645,
            pillowOrderId: null,
            userId: 1,
            userName: "Ibrahim",
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as any);

    render(
      <OrderFollowUpSheet open onOpenChange={() => undefined} order={sampleOrder} />
    );

    const sheet = screen.getByTestId("suivi-sheet");
    expect(within(sheet).getByTestId("suivi-timeline")).toBeInTheDocument();
    expect(within(sheet).getByText("raha khedaha lyoma")).toBeInTheDocument();
    expect(within(sheet).getByText("Ibrahim")).toBeInTheDocument();
  });

  it("submits follow-up and keeps drawer open (no Note coupling)", async () => {
    const user = userEvent.setup();
    mockedUseOrderFollowUps.mockReturnValue({
      data: { orderId: 1645, items: [] },
      isLoading: false,
      isError: false,
    } as any);

    render(
      <OrderFollowUpSheet open onOpenChange={() => undefined} order={sampleOrder} />
    );

    const sheet = screen.getByTestId("suivi-sheet");
    await user.type(
      within(sheet).getByPlaceholderText("Écrire la situation de la commande..."),
      "sortie avec livreur"
    );
    await user.click(within(sheet).getByRole("button", { name: "Ajouter le suivi" }));

    expect(mutate).toHaveBeenCalledWith(
      { orderId: 1645, content: "sortie avec livreur" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    // Note field is not part of this drawer — assert absence of note UI wording
    expect(within(sheet).queryByText(/Note sales|Note livreur|🟨/i)).not.toBeInTheDocument();
  });
});
