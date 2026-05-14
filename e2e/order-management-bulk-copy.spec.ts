import { expect, test } from "@playwright/test";

test("bulk copy order information copies selected rows", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("token", "test-token");
    // @ts-expect-error - test-only clipboard stub
    window.__copiedText = "";
    // @ts-expect-error - test-only clipboard stub
    navigator.clipboard = {
      writeText: async (text: string) => {
        // @ts-expect-error - test-only clipboard stub
        window.__copiedText = text;
      },
      readText: async () => {
        // @ts-expect-error - test-only clipboard stub
        return window.__copiedText;
      },
    };
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, name: "Admin", email: "admin@x.com", role: "ADMIN" }),
    });
  });

  await page.route("**/api/users", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 2, name: "Sales 1", email: "s1@x.com", role: "SALES", active: true }]),
    });
  });

  await page.route("**/api/delivery", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 10, name: "Standard Shipping", cities: ["Casablanca"] }]),
    });
  });

  await page.route("**/api/orders**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/api/orders") || url.pathname.endsWith("/orders")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 101,
              customerName: "Customer A",
              phone: "0611111111",
              address: "Addr A",
              city: "Casablanca",
              trackingCode: "TRK-AAA",
              status: "PENDING",
              createdAt: new Date("2026-05-10T10:00:00Z").toISOString(),
              totalAmount: 120,
              deliveryService: { id: 10, name: "Standard Shipping" },
              items: [
                { quantity: 2, price: 50, variant: { name: "42", product: { name: "Matelas" }, size: { value: "42" } } },
              ],
              note: "Fragile",
            },
            {
              id: 102,
              customerName: "Customer B",
              phone: "0622222222",
              address: "Addr B",
              city: "Rabat",
              trackingCode: "TRK-BBB",
              status: "IN_PROCESS",
              createdAt: new Date("2026-05-10T12:00:00Z").toISOString(),
              totalAmount: 200,
              deliveryService: { id: 10, name: "Standard Shipping" },
              items: [
                { quantity: 1, price: 200, variant: { name: "L", product: { name: "Oreiller" }, size: { value: "L" } } },
              ],
              note: "",
            },
          ],
          meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
        }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/orders-management");

  await expect(page.getByRole("heading", { name: "Order Management" })).toBeVisible();

  const rowCheckboxes = page.getByLabel("Select row");
  await expect(rowCheckboxes).toHaveCount(2);

  await rowCheckboxes.nth(0).click();
  await rowCheckboxes.nth(1).click();

  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
  await page.getByRole("button", { name: "Copy" }).click();

  const copied = await page.evaluate(() => {
    // @ts-expect-error - test-only clipboard stub
    return window.__copiedText as string;
  });

  expect(copied).toContain("Customer: Customer A");
  expect(copied).toContain("Phone: 0611111111");
  expect(copied).toContain("Address: Addr A");
  expect(copied).toContain("City: Casablanca");
  expect(copied).toContain("Products:");
  expect(copied).toContain("Note: Fragile");

  expect(copied).toContain("Customer: Customer B");
  expect(copied).toContain("City: Rabat");

  expect(copied).not.toContain("Salesman:");
  expect(copied).not.toContain("Confirmation:");
  expect(copied).not.toContain("Delivery:");
  expect(copied).not.toContain("Status:");
  expect(copied).not.toContain("Order #");
  expect(copied).not.toContain("Date:");
});

