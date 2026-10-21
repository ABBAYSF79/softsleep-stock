import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  buildSuiviWhatsAppConfirmMessage,
  buildSuiviWhatsAppDelayApologyMessage,
  buildSuiviWhatsAppHomeDeliveryTodayMessage,
  buildSuiviWhatsAppPostOfficeMessage,
  buildSuiviWhatsAppShippingMessage,
  openWhatsAppWithMessage,
  toWhatsAppPhone,
} from "@/utils/order-utils";

type TemplateId =
  | "confirm"
  | "shipping"
  | "postOffice"
  | "homeToday"
  | "delayApology";

const TEMPLATES: Array<{
  id: TemplateId;
  label: string;
  needsTracking?: boolean;
  build: (order: any) => string;
}> = [
  {
    id: "confirm",
    label: "تأكيد الطلب",
    build: buildSuiviWhatsAppConfirmMessage,
  },
  {
    id: "shipping",
    label: "الطلبية في طريقها إليكم",
    needsTracking: true,
    build: buildSuiviWhatsAppShippingMessage,
  },
  {
    id: "postOffice",
    label: "الطلبية وصلت إلى مكتب البريد",
    needsTracking: true,
    build: buildSuiviWhatsAppPostOfficeMessage,
  },
  {
    id: "homeToday",
    label: "التوصيل إلى المنزل اليوم",
    needsTracking: true,
    build: buildSuiviWhatsAppHomeDeliveryTodayMessage,
  },
  {
    id: "delayApology",
    label: "اعتذار عن التأخير",
    needsTracking: true,
    build: buildSuiviWhatsAppDelayApologyMessage,
  },
];

/** Detect dominant script to pick textarea direction (Arabic templates → rtl). */
function detectMessageDir(text: string): "rtl" | "ltr" {
  const arabic = (text.match(/[\u0600-\u06FF]/g) || []).join("").length;
  const latin = (text.match(/[A-Za-z]/g) || []).join("").length;
  if (arabic === 0 && latin === 0) return "rtl";
  return arabic >= latin ? "rtl" : "ltr";
}

interface SuiviWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any | null;
}

export function SuiviWhatsAppDialog({
  open,
  onOpenChange,
  order,
}: SuiviWhatsAppDialogProps) {
  const [message, setMessage] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<TemplateId>("confirm");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setActiveTemplate("confirm");
    setMessage(buildSuiviWhatsAppConfirmMessage(order));
    setIsSending(false);
  }, [open, order]);

  const phone = order?.phone?.trim() || "";
  const waPhone = useMemo(() => toWhatsAppPhone(phone), [phone]);
  const messageDir = detectMessageDir(message);
  const customerName = (order?.customerName || "").trim() || "زبون";

  const applyTemplate = (templateId: TemplateId) => {
    if (!order) return;
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    if (template.needsTracking && !String(order.trackingCode || "").trim()) {
      toast.message("Pas de code Amana — tu peux le compléter dans le message");
    }

    setActiveTemplate(templateId);
    setMessage(template.build(order));
  };

  const handleSend = () => {
    if (isSending) return;
    if (!phone) {
      toast.error("Numéro client manquant");
      return;
    }
    if (!waPhone) {
      toast.error("Numéro client invalide pour WhatsApp");
      return;
    }
    if (!message.trim()) {
      toast.error("Le message est vide");
      return;
    }

    setIsSending(true);
    try {
      if (!openWhatsAppWithMessage(phone, message)) {
        toast.error("Numéro client invalide pour WhatsApp");
        setIsSending(false);
        return;
      }
      toast.success("WhatsApp ouvert");
      onOpenChange(false);
    } catch {
      toast.error("Impossible d'ouvrir WhatsApp");
      setIsSending(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(92vh,720px)] w-[calc(100vw-1.25rem)] flex-col gap-0 overflow-hidden p-0",
          "sm:max-w-[560px]"
        )}
      >
        {/* Header */}
        <DialogHeader className="space-y-3 border-b border-[#25D366]/20 bg-gradient-to-b from-[#25D366]/10 to-transparent px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm">
              <MessageCircle className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-1 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight sm:text-lg">
                رسائل WhatsApp للزبون
              </DialogTitle>
              <DialogDescription className="sr-only">
                Choisis un modèle, modifie le message, puis envoie au client.
              </DialogDescription>
              <p className="truncate text-sm font-semibold text-foreground">
                {customerName}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {phone ? (
                  <span className="inline-flex items-center gap-1 tabular-nums" dir="ltr">
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {phone}
                  </span>
                ) : (
                  <span className="text-destructive">Numéro manquant</span>
                )}
                {waPhone ? (
                  <span className="tabular-nums text-[#128C7E]" dir="ltr">
                    WhatsApp +{waPhone}
                  </span>
                ) : phone ? (
                  <span className="text-destructive">Format non reconnu</span>
                ) : null}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Modèles
            </Label>
            <div
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              role="group"
              aria-label="Modèles de message"
            >
              {TEMPLATES.map((template) => {
                const active = activeTemplate === template.id;
                return (
                  <Button
                    key={template.id}
                    type="button"
                    variant="outline"
                    dir="rtl"
                    lang="ar"
                    className={cn(
                      "h-auto min-h-10 justify-center whitespace-normal px-3 py-2.5 text-center text-sm font-medium leading-snug",
                      active &&
                        "border-[#25D366] bg-[#25D366]/10 text-[#075E54] ring-1 ring-[#25D366]/40 hover:bg-[#25D366]/15"
                    )}
                    aria-pressed={active}
                    onClick={() => applyTemplate(template.id)}
                  >
                    {template.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="suivi-wa-message" className="text-sm font-medium">
              Message
            </Label>
            <Textarea
              id="suivi-wa-message"
              lang={messageDir === "rtl" ? "ar" : undefined}
              dir={messageDir}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
              }}
              rows={9}
              spellCheck={false}
              className={cn(
                "min-h-[180px] resize-y px-3.5 py-3 text-[15px] leading-7 tracking-normal",
                "focus-visible:ring-[#25D366]/40",
                "[unicode-bidi:plaintext]",
                messageDir === "rtl" ? "text-right" : "text-left"
              )}
              placeholder={
                messageDir === "rtl"
                  ? "اكتب أو عدّل الرسالة هنا…"
                  : "Écris ou modifie le message…"
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Tu peux modifier le texte avant l’envoi. Les codes et montants restent
              éditables.
            </p>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:justify-end sm:space-x-2 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={isSending}
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            className="w-full bg-[#25D366] text-white hover:bg-[#1ebe57] sm:w-auto"
            onClick={handleSend}
            disabled={!waPhone || !message.trim() || isSending}
          >
            <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
            {isSending ? "Ouverture…" : "Envoyer sur WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
