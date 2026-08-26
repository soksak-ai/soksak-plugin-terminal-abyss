import { describe, expect, it, vi } from "vitest";
import { attachComposition, bracketPaste, isCompositionKeydown } from "./composition";

function setup(bracketed = false) {
  const input = document.createElement("textarea");
  document.body.append(input);
  const emit = vi.fn();
  const preedit = vi.fn();
  let clock = 1000;
  let last: { text: string; at: number } | null = null;
  const binding = attachComposition(input, { emit, preedit, bracketedPaste: () => bracketed, now: () => clock, lastKeydown: () => last });
  return { input, emit, preedit, binding, tick: (ms: number) => { clock += ms; }, keydown: (text: string) => { last = { text, at: clock }; } };
}

describe("composition", () => {
  it("emits a composed string once even when input echoes it", () => {
    const { input, emit } = setup();
    input.dispatchEvent(new Event("compositionstart"));
    input.value = "하";
    input.dispatchEvent(new Event("input"));
    input.value = "한";
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "한" }));
    input.value = "한";
    input.dispatchEvent(new Event("input"));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("한");
    expect(input.value).toBe("");
  });
  it("recognises composition keydowns and emits plain input otherwise", () => {
    expect(isCompositionKeydown({ keyCode: 229, key: "a" })).toBe(true);
    expect(isCompositionKeydown({ isComposing: true, key: "a" })).toBe(true);
    expect(isCompositionKeydown({ key: "Process" })).toBe(true);
    expect(isCompositionKeydown({ keyCode: 65, key: "a" })).toBe(false);
    const { input, emit } = setup();
    input.value = "é";
    input.dispatchEvent(new Event("input"));
    expect(emit).toHaveBeenCalledWith("é");
    expect(input.value).toBe("");
  });
  it("dedupes beforeinput insertText against the last keydown within 100 ms", () => {
    const { input, keydown, tick } = setup();
    keydown("a");
    const near = new InputEvent("beforeinput", { inputType: "insertText", data: "a", cancelable: true });
    input.dispatchEvent(near);
    expect(near.defaultPrevented).toBe(true);
    tick(150);
    const late = new InputEvent("beforeinput", { inputType: "insertText", data: "a", cancelable: true });
    input.dispatchEvent(late);
    expect(late.defaultPrevented).toBe(false);
  });
  it("brackets a paste when the mode is on and strips escapes", () => {
    expect(bracketPaste("a\x1bb\nc", true)).toBe("\x1b[200~ab\rc\x1b[201~");
    expect(bracketPaste("a\r\nb", false)).toBe("a\rb");
    const { emit, binding } = setup(true);
    binding.paste("ls\n");
    expect(emit).toHaveBeenCalledWith("\x1b[200~ls\r\x1b[201~");
  });
  it("shows a resumed preedit without compositionstart and hides it on commit", () => {
    const { input, preedit } = setup();
    input.dispatchEvent(new CompositionEvent("compositionupdate", { data: "한" }));
    expect(preedit).toHaveBeenLastCalledWith("한");
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "한" }));
    expect(preedit).toHaveBeenLastCalledWith("");
  });
  it("emits an IBus Hangul and ASCII sequence once and in order", () => {
    const { input, emit } = setup();
    const composition = (type: string, data = "") => input.dispatchEvent(new CompositionEvent(type, { data }));
    const inputText = (value: string, inputType: string, data: string | null) => {
      input.dispatchEvent(new InputEvent("beforeinput", { inputType, data, cancelable: true }));
      input.value = value;
      input.dispatchEvent(new InputEvent("input", { inputType, data }));
    };
    const ibusCommit = (text: string) => {
      composition("compositionstart");
      composition("compositionupdate", text);
      inputText(text, "insertCompositionText", text);
      composition("compositionupdate");
      inputText("", "deleteContentBackward", null);
      composition("compositionend");
      inputText(text, "insertText", text);
    };

    ibusCommit("한");
    inputText("a", "insertText", "a");
    inputText("b", "insertText", "b");
    inputText("c", "insertText", "c");
    ibusCommit("글");
    expect(emit.mock.calls.map(([value]) => value)).toEqual(["한", "a", "b", "c", "글"]);
  });
  it("commits the textarea value when macOS ends composition with empty event data", () => {
    const { input, emit, preedit } = setup();
    input.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
    input.value = "한";
    input.dispatchEvent(new CompositionEvent("compositionupdate", { data: "한" }));
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "" }));

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith("한");
    expect(preedit).toHaveBeenLastCalledWith("");
    expect(input.value).toBe("");
  });
});
