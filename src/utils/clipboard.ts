/** Copies text, falling back to execCommand where navigator.clipboard is unavailable (plain HTTP). */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  // The textarea must sit inside an open dialog, otherwise its focus trap blocks the selection.
  const container = document.querySelector('[role="dialog"]') ?? document.body;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  container.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    container.removeChild(textarea);
  }
};
