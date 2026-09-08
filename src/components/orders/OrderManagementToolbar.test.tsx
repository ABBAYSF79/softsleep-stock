import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderManagementToolbar } from "@/components/orders/OrderManagementToolbar";

const baseProps = {
  totalOrders: 166,
  subtitle: "Create, review & manage",
  isAdmin: true,
  isLivreur: false,
  isRefetching: false,
  onRefresh: vi.fn(),
  onAddOrder: vi.fn(),
  searchQuery: "",
  onSearchQueryChange: vi.fn(),
  statusFilter: "all",
  onStatusFilterChange: vi.fn(),
  salesmanIdFilter: "all",
  onSalesmanIdFilterChange: vi.fn(),
  deliveryServiceIdFilter: "all",
  onDeliveryServiceIdFilterChange: vi.fn(),
  dateFilter: "last3months",
  onDateFilterChange: vi.fn(),
  customDateRange: undefined,
  onCustomDateRangeChange: vi.fn(),
  salesmanOptions: [{ label: "Ibrahim", value: "1" }],
  deliveryServiceOptions: [{ label: "Amana", value: "10" }],
  activeFiltersCount: 0,
  onClearFilters: vi.fn(),
};

describe("OrderManagementToolbar", () => {
  it("renders compact header with count, live badge and actions", () => {
    render(<OrderManagementToolbar {...baseProps} />);

    expect(screen.getByTestId("order-management-toolbar")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Order Management" })).toBeInTheDocument();
    expect(screen.getByTestId("order-management-live")).toHaveTextContent(/Live/i);
    expect(screen.getByTestId("order-management-count")).toHaveTextContent("166");
    expect(screen.getByText(/Create, review & manage/)).toBeInTheDocument();
    expect(screen.getByTestId("order-management-refresh")).toBeInTheDocument();
    expect(screen.getByTestId("order-management-add")).toBeInTheDocument();
  });

  it("keeps primary actions separated from the filter bar", () => {
    render(<OrderManagementToolbar {...baseProps} />);

    const header = screen.getByTestId("order-management-header");
    const filters = screen.getByTestId("order-management-filters");

    expect(header).toContainElement(screen.getByTestId("order-management-refresh"));
    expect(header).toContainElement(screen.getByTestId("order-management-add"));
    expect(filters).not.toContainElement(screen.getByTestId("order-management-add"));
    expect(filters).toContainElement(
      screen.getByPlaceholderText("Search orders...")
    );
  });

  it("renders all filters and supports search + clear", async () => {
    const user = userEvent.setup();
    const onSearchQueryChange = vi.fn();
    const onClearFilters = vi.fn();
    const onRefresh = vi.fn();
    const onAddOrder = vi.fn();

    render(
      <OrderManagementToolbar
        {...baseProps}
        searchQuery="reda"
        activeFiltersCount={1}
        onSearchQueryChange={onSearchQueryChange}
        onClearFilters={onClearFilters}
        onRefresh={onRefresh}
        onAddOrder={onAddOrder}
      />
    );

    expect(screen.getByLabelText(/Search orders/i)).toHaveValue("reda");
    expect(screen.getByLabelText("Filter by status")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by date")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by salesman")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by delivery service")).toBeInTheDocument();
    expect(screen.getByTestId("order-management-active-filters")).toHaveTextContent(
      "1 filter"
    );

    await user.click(screen.getByTestId("order-management-clear-filters"));
    expect(onClearFilters).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("order-management-refresh"));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("order-management-add"));
    expect(onAddOrder).toHaveBeenCalledTimes(1);
  });

  it("hides Add order for livreur and salesman filter for non-admin", () => {
    render(
      <OrderManagementToolbar {...baseProps} isAdmin={false} isLivreur />
    );

    expect(screen.queryByTestId("order-management-add")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by salesman")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Filter by delivery service")).toBeInTheDocument();
  });

  it("shows custom date range when date filter is custom", () => {
    render(<OrderManagementToolbar {...baseProps} dateFilter="custom" />);
    expect(screen.getByRole("button", { name: "Pick a date range" })).toBeInTheDocument();
  });

  it("documents that Suivi and Note live outside this toolbar", () => {
    render(<OrderManagementToolbar {...baseProps} />);
    expect(screen.queryByLabelText("Suivi")).not.toBeInTheDocument();
    expect(screen.queryByText(/Note sales|Note livreur|🟨/i)).not.toBeInTheDocument();
  });
});
