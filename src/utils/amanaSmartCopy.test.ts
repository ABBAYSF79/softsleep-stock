import { describe, expect, it } from "vitest";
import type { AmanaManagementExportRow } from "@/hooks/useApi";
import {
  buildAmanaSmartCopyText,
  formatAmanaSmartCopyCount,
  groupAmanaSmartCopyRows,
} from "@/utils/amanaSmartCopy";

const sortie = { code: "SORTI_A_DESTINATION", label: "Envoi sorti à destination" };
const facteur = { code: "SORTI_PAR_FACTEUR", label: "Envoi sorti par le facteur" };
const recuperer = { code: "A_RECUPERER", label: "Envoi à récupérer" };
const livree = { code: "LIVREE", label: "Livrée" };

const row = (
  id: number,
  trackingCode: string | null,
  city: string | null,
  amanaStatus: AmanaManagementExportRow["amanaStatus"],
  currentStatusNote: string | null = null
): AmanaManagementExportRow => ({ id, customerName: `C${id}`, city, trackingCode, amanaStatus, currentStatusNote });

describe("Amana Smart Copy WhatsApp text", () => {
  it("matches the delivery-report format exactly", () => {
    const text = buildAmanaSmartCopyText([
      row(5, "jbjbjkbkj", "Rabat", livree),
      row(1, "QD136777911MA", "Rabat", sortie),
      row(3, "fkndnlkvnd", "Rabat", facteur, "aydiweha lih ldare"),
      row(2, "QD136778090MA", "Casablanca", sortie),
      row(4, "v bn", "Rabat", recuperer),
    ]);
    expect(text).toBe(
      [
        "*Envoi sorti à destination*",
        "2 commandes",
        "",
        "- QD136777911MA – Rabat : Envoi sorti à destination.",
        "- QD136778090MA – Casablanca : Envoi sorti à destination.",
        "",
        "*Envoi sorti par le facteur*",
        "1 commande",
        "",
        "- fkndnlkvnd – Rabat : Envoi sorti par le facteur.",
        "  Note : aydiweha lih ldare",
        "",
        "*Envoi à récupérer*",
        "1 commande",
        "",
        "- v bn – Rabat : Envoi à récupérer.",
        "",
        "*Livrée*",
        "1 commande",
        "",
        "- jbjbjkbkj – Rabat : Livrée.",
      ].join("\n")
    );
  });

  it("keeps notes under their own order and adds a blank line after a noted entry", () => {
    const text = buildAmanaSmartCopyText([
      row(1, "AD123456MA", "Rabat", sortie, "Client injoignable"),
      row(2, "AD456789MA", "Casablanca", sortie),
      row(3, "AD789012MA", "Salé", sortie, "Problème d'adresse"),
    ]);
    expect(text).toBe(
      [
        "*Envoi sorti à destination*",
        "3 commandes",
        "",
        "- AD123456MA – Rabat : Envoi sorti à destination.",
        "  Note : Client injoignable",
        "",
        "- AD456789MA – Casablanca : Envoi sorti à destination.",
        "- AD789012MA – Salé : Envoi sorti à destination.",
        "  Note : Problème d'adresse",
      ].join("\n")
    );
  });

  it("omits empty notes, flattens multi-line notes, dedupes, and lists uninitialized last", () => {
    const text = buildAmanaSmartCopyText([
      row(9, null, null, null),
      row(1, "AD1", "Rabat", sortie, "Ligne 1\nLigne 2"),
      row(1, "AD1", "Rabat", sortie, "doublon"),
      row(2, "AD2", "Fès", sortie, "   "),
    ]);
    expect(text).toBe(
      [
        "*Envoi sorti à destination*",
        "2 commandes",
        "",
        "- AD1 – Rabat : Envoi sorti à destination.",
        "  Note : Ligne 1 Ligne 2",
        "",
        "- AD2 – Fès : Envoi sorti à destination.",
        "",
        "*Non initialisé*",
        "1 commande",
        "",
        "- — – — : Non initialisé.",
      ].join("\n")
    );
  });

  it("pluralizes counts and follows the status catalog order", () => {
    expect(formatAmanaSmartCopyCount(1)).toBe("1 commande");
    expect(formatAmanaSmartCopyCount(2)).toBe("2 commandes");
    expect(
      groupAmanaSmartCopyRows([row(1, "a", "x", livree), row(2, "b", "y", recuperer)]).map((g) => g.key)
    ).toEqual(["A_RECUPERER", "LIVREE"]);
  });
});
