import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AmanaManagementExportRow } from "@/hooks/useApi";

vi.mock("@/hooks/useApi", () => ({ fetchAmanaManagementExport: vi.fn() }));
vi.mock("@/utils/clipboard", () => ({ copyText: vi.fn() }));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { fetchAmanaManagementExport } from "@/hooks/useApi";
import { copyText } from "@/utils/clipboard";
import api from "@/lib/api";
import { AmanaSmartCopyDialog } from "@/components/amana/AmanaSmartCopyDialog";

const mockedFetch = vi.mocked(fetchAmanaManagementExport);
const mockedCopy = vi.mocked(copyText);

const sortie = { code: "SORTI_A_DESTINATION", label: "Envoi sorti à destination" };
const facteur = { code: "SORTI_PAR_FACTEUR", label: "Envoi sorti par le facteur" };
const livree = { code: "LIVREE", label: "Livrée" };

const rows: AmanaManagementExportRow[] = [
  { id: 1, customerName: "A", city: "Rabat", trackingCode: "QD136777911MA", amanaStatus: sortie, currentStatusNote: null },
  { id: 2, customerName: "B", city: "Casablanca", trackingCode: "QD136778090MA", amanaStatus: sortie, currentStatusNote: "Appeler avant" },
  { id: 3, customerName: "C", city: "Rabat", trackingCode: "fkn dnlkvnd", amanaStatus: facteur, currentStatusNote: "aydiweha lih ldare" },
  { id: 4, customerName: "D", city: "Rabat", trackingCode: "jbj bjkbkj", amanaStatus: livree, currentStatusNote: null },
];

const FULL_TEXT = [
  "*Envoi sorti à destination*",
  "2 commandes",
  "",
  "- QD136777911MA – Rabat : Envoi sorti à destination.",
  "- QD136778090MA – Casablanca : Envoi sorti à destination.",
  "  Note : Appeler avant",
  "",
  "*Envoi sorti par le facteur*",
  "1 commande",
  "",
  "- fkn dnlkvnd – Rabat : Envoi sorti par le facteur.",
  "  Note : aydiweha lih ldare",
  "",
  "*Livrée*",
  "1 commande",
  "",
  "- jbj bjkbkj – Rabat : Livrée.",
].join("\n");

function renderDialog(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

async function openDialog() {
  const onOpenChange = vi.fn();
  renderDialog(<AmanaSmartCopyDialog open onOpenChange={onOpenChange} orderIds={[4, 3, 2, 1]} />);
  const editor = (await screen.findByLabelText("Rapport WhatsApp")) as HTMLTextAreaElement;
  return { editor, onOpenChange };
}

describe("AmanaSmartCopyDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockResolvedValue({ total: rows.length, data: rows });
    mockedCopy.mockResolvedValue(true);
  });

  it("generates the full grouped report for the selected orders (read-only fetch)", async () => {
    const { editor } = await openDialog();
    expect(editor.value).toBe(FULL_TEXT);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith({ orderIds: [1, 2, 3, 4] });
    expect(screen.getByText("4 commandes incluses sur 4")).toBeInTheDocument();
  });

  it("copies the edited text exactly, and reset restores the generated text", async () => {
    const user = userEvent.setup();
    const { editor } = await openDialog();

    await user.click(editor);
    await user.keyboard("{Control>}{End}{/Control}");
    await user.type(editor, "{Enter}{Enter}Merci de vérifier.");
    const edited = `${FULL_TEXT}\n\nMerci de vérifier.`;
    expect(editor.value).toBe(edited);

    await user.click(screen.getByRole("button", { name: /Copier pour WhatsApp/ }));
    expect(mockedCopy).toHaveBeenCalledWith(edited);
    expect(await screen.findByRole("button", { name: /Copié/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Réinitialiser$/ }));
    expect(editor.value).toBe(FULL_TEXT);
  });

  it("toggles a whole status group off and back on without touching other groups", async () => {
    const user = userEvent.setup();
    const { editor } = await openDialog();
    const chip = screen.getByRole("button", { name: /^Envoi sorti par le facteur/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");

    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    // Deselected chip stays visible so it can be re-selected.
    expect(screen.getByRole("button", { name: /^Envoi sorti par le facteur/ })).toBeInTheDocument();
    expect(editor.value).not.toContain("Envoi sorti par le facteur");
    expect(editor.value).not.toContain("aydiweha");
    expect(editor.value).toContain("*Envoi sorti à destination*\n2 commandes");
    expect(editor.value).toContain("*Livrée*\n1 commande");
    expect(screen.getByText("3 commandes incluses sur 4")).toBeInTheDocument();

    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(editor.value).toBe(FULL_TEXT);
  });

  it("selects only the wanted groups via deselect-all then individual picks", async () => {
    const user = userEvent.setup();
    const { editor } = await openDialog();

    await user.click(screen.getByRole("button", { name: "Tout désélectionner" }));
    expect(editor.value).toBe("");
    await user.click(screen.getByRole("button", { name: /^Livrée/ }));
    expect(editor.value).toBe("*Livrée*\n1 commande\n\n- jbj bjkbkj – Rabat : Livrée.");

    await user.click(screen.getByRole("button", { name: "Tout sélectionner" }));
    expect(editor.value).toBe(FULL_TEXT);
  });

  it("removes individual orders, updates counts, hides empty groups, and restores", async () => {
    const user = userEvent.setup();
    const { editor } = await openDialog();

    await user.click(screen.getByRole("button", { name: /Gérer les commandes/ }));
    const list = screen.getByRole("list", { name: "Commandes du rapport" });

    await user.click(within(list).getByRole("checkbox", { name: "Inclure QD136777911MA" }));
    expect(editor.value).toContain("*Envoi sorti à destination*\n1 commande\n");
    expect(editor.value).not.toContain("QD136777911MA");
    // Remaining order of the group keeps its own note.
    expect(editor.value).toContain(
      "- QD136778090MA – Casablanca : Envoi sorti à destination.\n  Note : Appeler avant"
    );

    await user.click(within(list).getByRole("checkbox", { name: "Inclure jbj bjkbkj" }));
    expect(editor.value).not.toContain("Livrée");
    expect(editor.value).toContain(
      "- fkn dnlkvnd – Rabat : Envoi sorti par le facteur.\n  Note : aydiweha lih ldare"
    );

    await user.click(screen.getByRole("button", { name: /Restaurer les commandes \(2\)/ }));
    expect(editor.value).toBe(FULL_TEXT);
  });

  it("never overwrites manual edits when groups change; regenerate is explicit", async () => {
    const user = userEvent.setup();
    const { editor } = await openDialog();

    await user.clear(editor);
    await user.type(editor, "Texte perso");
    await user.click(screen.getByRole("button", { name: /^Livrée/ }));

    expect(editor.value).toBe("Texte perso");
    await user.click(screen.getByRole("button", { name: "Régénérer le texte" }));
    await waitFor(() => expect(editor.value).not.toContain("Livrée"));
    expect(editor.value).toContain("*Envoi sorti à destination*\n2 commandes");
  });

  it("performs no write requests for any report action", async () => {
    const user = userEvent.setup();
    const { editor } = await openDialog();
    await user.click(screen.getByRole("button", { name: /^Livrée/ }));
    await user.click(screen.getByRole("button", { name: /Gérer les commandes/ }));
    await user.click(screen.getByRole("checkbox", { name: "Inclure QD136777911MA" }));
    await user.type(editor, " x");
    await user.click(screen.getByRole("button", { name: /Copier pour WhatsApp/ }));

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
