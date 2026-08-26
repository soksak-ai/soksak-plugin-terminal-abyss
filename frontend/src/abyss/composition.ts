export interface CompositionOptions {
  emit(text: string): void;
  bracketedPaste(): boolean;
  now(): number;
  lastKeydown(): { text: string; at: number } | null;
  dedupeWindowMs?: number;
}
export interface CompositionBinding { dispose(): void; isComposing(): boolean; paste(text: string): void }

export function isCompositionKeydown(event: { keyCode?: number; isComposing?: boolean; key?: string }): boolean {
  return event.keyCode === 229 || event.isComposing === true || event.key === "Process";
}

export function bracketPaste(text: string, bracketed: boolean): string {
  const normalized = text.replace(/\r\n?/g, "\r").replace(/\n/g, "\r");
  return bracketed ? `\x1b[200~${normalized.replace(/\x1b/g, "")}\x1b[201~` : normalized;
}

export function attachComposition(input: HTMLTextAreaElement, options: CompositionOptions): CompositionBinding {
  let composing = false;
  let lastComposed = { text: "", at: -Infinity };
  const window = options.dedupeWindowMs ?? 100;
  const clear = () => { input.value = ""; };
  const onStart = () => { composing = true; };
  const onEnd = (event: Event) => {
    composing = false;
    const data = (event as CompositionEvent).data ?? input.value;
    clear();
    if (data) { lastComposed = { text: data, at: options.now() }; options.emit(data); }
  };
  const onInput = () => {
    if (composing) return;
    const value = input.value;
    clear();
    if (!value) return;
    if (value === lastComposed.text && options.now() - lastComposed.at <= window) return;
    options.emit(value);
  };
  const onBeforeInput = (event: Event) => {
    const detail = event as InputEvent;
    if (detail.inputType !== "insertText" || !detail.data) return;
    const last = options.lastKeydown();
    if (last && last.text === detail.data && options.now() - last.at <= window) event.preventDefault();
  };
  const onPaste = (event: Event) => {
    event.preventDefault();
    const text = (event as ClipboardEvent).clipboardData?.getData("text") ?? "";
    if (text) options.emit(bracketPaste(text, options.bracketedPaste()));
  };
  input.addEventListener("compositionstart", onStart);
  input.addEventListener("compositionend", onEnd);
  input.addEventListener("input", onInput);
  input.addEventListener("beforeinput", onBeforeInput);
  input.addEventListener("paste", onPaste);
  return {
    isComposing: () => composing,
    paste(text) { if (text) options.emit(bracketPaste(text, options.bracketedPaste())); },
    dispose() {
      input.removeEventListener("compositionstart", onStart);
      input.removeEventListener("compositionend", onEnd);
      input.removeEventListener("input", onInput);
      input.removeEventListener("beforeinput", onBeforeInput);
      input.removeEventListener("paste", onPaste);
    },
  };
}
