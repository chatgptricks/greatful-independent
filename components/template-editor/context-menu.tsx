"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./context-menu.css";

export type ContextMenuItem = {
  id: string;
  label: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
  /** Draw a divider before this item. */
  separator?: boolean;
};
export type ContextMenuDefinition = { label: string; items: ContextMenuItem[] };
type Anchor = ReactMouseEvent | { x: number; y: number; returnFocus?: HTMLElement };
type MenuState = ContextMenuDefinition & { x: number; y: number; returnFocus: HTMLElement | null; portal: HTMLElement; sequence: number };
type MenuAPI = { openMenu: (anchor: Anchor, menu: ContextMenuDefinition) => void; closeMenu: () => void };
const MenuContext = createContext<MenuAPI | null>(null);

export function useContextMenu(): MenuAPI {
  const context = useContext(MenuContext);
  if (!context) throw new Error("useContextMenu requires ContextMenuProvider.");
  return context;
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;
type TextSnapshot = {
  target: HTMLElement;
  control: TextControl | null;
  range: Range | null;
  start: number;
  end: number;
  original: string;
  selected: string;
  writable: boolean;
  private: boolean;
};

function textTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const editable = target.closest<HTMLElement>('textarea, input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="hidden"]), [contenteditable="true"], [contenteditable="plaintext-only"]');
  return editable;
}

function captureText(target: HTMLElement): TextSnapshot {
  const control = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
  const original = control ? control.value : target.innerText;
  const start = control?.selectionStart ?? 0;
  const end = control?.selectionEnd ?? (control ? original.length : 0);
  const selection = window.getSelection();
  let range: Range | null = null;
  if (!control) {
    if (selection?.rangeCount && target.contains(selection.getRangeAt(0).commonAncestorContainer)) range = selection.getRangeAt(0).cloneRange();
    else { range = document.createRange(); range.selectNodeContents(target); range.collapse(false); }
  }
  return {
    target, control, range, start, end, original,
    selected: control ? original.slice(start, end) : range?.toString() ?? "",
    writable: control ? !control.disabled && !control.readOnly && !control.closest("fieldset:disabled") : target.isContentEditable,
    private: control instanceof HTMLInputElement && control.type === "password",
  };
}

function restoreText(snapshot: TextSnapshot) {
  if (!snapshot.target.isConnected) throw new Error("Select the text again, then use its menu.");
  snapshot.target.focus({ preventScroll: true });
  if (snapshot.control) {
    try { snapshot.control.setSelectionRange(snapshot.start, snapshot.end); } catch { /* Numeric inputs have no text-selection API. */ }
  } else if (snapshot.range) {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(snapshot.range);
  }
}

function replaceText(snapshot: TextSnapshot, text: string) {
  if (!snapshot.writable) return;
  if (snapshot.control ? snapshot.control.disabled || snapshot.control.readOnly || Boolean(snapshot.control.closest("fieldset:disabled")) : !snapshot.target.isContentEditable) throw new Error("This text is no longer editable.");
  const value = snapshot.control ? snapshot.control.value : snapshot.target.innerText;
  if (value !== snapshot.original) throw new Error("The text changed while the menu was open. Open the menu again.");
  restoreText(snapshot);
  if (snapshot.control) {
    const control = snapshot.control;
    const available = control.maxLength < 0 ? Infinity : Math.max(0, control.maxLength - (value.length - snapshot.end + snapshot.start));
    const insert = text.slice(0, available);
    const next = value.slice(0, snapshot.start) + insert + value.slice(snapshot.end);
    const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    // Use the native setter so React's controlled-field tracker receives the input event.
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, next);
    try { control.setSelectionRange(snapshot.start + insert.length, snapshot.start + insert.length); } catch { /* Numeric inputs cannot set a caret. */ }
    control.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: text ? "insertFromPaste" : "deleteByCut", data: insert }));
  } else {
    // Keep native undo where supported. The fallback never inserts HTML.
    if (document.execCommand(text ? "insertText" : "delete", false, text)) return;
    const range = snapshot.range;
    if (!range) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    snapshot.target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: text ? "insertFromPaste" : "deleteByCut", data: text }));
  }
}

export function ContextMenuProvider({ children, defaultMenu }: {
  children: ReactNode;
  defaultMenu?: ContextMenuDefinition | (() => ContextMenuDefinition);
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [notice, setNotice] = useState<{ text: string; portal: HTMLElement } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<MenuState | null>(null);
  const sequence = useRef(0);

  const closeMenu = useCallback(() => {
    const previous = stateRef.current;
    stateRef.current = null;
    setMenu(null);
    if (previous?.returnFocus?.isConnected) previous.returnFocus.focus({ preventScroll: true });
  }, []);

  const openMenu = useCallback((anchor: Anchor, definition: ContextMenuDefinition) => {
    let x: number, y: number, returnFocus: HTMLElement | null;
    if ("clientX" in anchor) {
      anchor.preventDefault();
      anchor.stopPropagation();
      const clicked = anchor.target instanceof Element ? anchor.target.closest<HTMLElement>('button, a[href], input, textarea, select, [tabindex], [contenteditable="true"]') : null;
      returnFocus = clicked ?? (anchor.currentTarget instanceof HTMLElement && anchor.currentTarget.tabIndex >= 0 ? anchor.currentTarget : document.activeElement as HTMLElement | null);
      const rect = returnFocus?.getBoundingClientRect();
      x = anchor.clientX || rect?.left || 8;
      y = anchor.clientY || rect?.bottom || 8;
    } else {
      ({ x, y } = anchor);
      returnFocus = anchor.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
    const portal = returnFocus?.closest<HTMLDialogElement>("dialog[open]") ?? document.body;
    const next = { ...definition, x, y, returnFocus, portal, sequence: ++sequence.current };
    stateRef.current = next;
    setMenu(next);
  }, []);

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node || !menu) return;
    const bounds = node.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
    node.style.left = `${Math.max(left + 8, Math.min(menu.x, left + width - bounds.width - 8))}px`;
    node.style.top = `${Math.max(top + 8, Math.min(menu.y, top + height - bounds.height - 8))}px`;
    const first = node.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    (first ?? node).focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const outside = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) closeMenu(); };
    const resize = () => closeMenu();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", outside, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", outside, true);
      window.removeEventListener("resize", resize);
    };
  }, [menu, closeMenu]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6500);
    return () => clearTimeout(timer);
  }, [notice]);

  function showTextMenu(event: ReactMouseEvent, target: HTMLElement) {
    const snapshot = captureText(target);
    const portal = target.closest<HTMLDialogElement>("dialog[open]") ?? document.body;
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
    async function copy() {
      restoreText(snapshot);
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(snapshot.selected);
      } catch {
        restoreText(snapshot);
        if (!document.execCommand("copy")) throw new Error(`Copy is unavailable here. Use ${modifier}C with your text selected.`);
      }
    }
    const items: ContextMenuItem[] = [
      { id: "text-copy", label: "Copy", shortcut: `${modifier}C`, disabled: !snapshot.selected || snapshot.private, onSelect: copy },
      { id: "text-cut", label: "Cut", shortcut: `${modifier}X`, disabled: !snapshot.writable || !snapshot.selected || snapshot.private, onSelect: async () => { await copy(); replaceText(snapshot, ""); } },
      { id: "text-paste", label: "Paste", shortcut: `${modifier}V`, disabled: !snapshot.writable, onSelect: async () => {
        try {
          if (!navigator.clipboard?.readText) throw new Error("Clipboard unavailable");
          const text = await navigator.clipboard.readText();
          replaceText(snapshot, text);
        } catch (error) {
          setNotice({ text: error instanceof Error && error.message.startsWith("The text changed") ? error.message : `Paste is unavailable here. Use ${modifier}V in the text field.`, portal });
        }
      } },
      { id: "text-select-all", label: "Select all", shortcut: `${modifier}A`, separator: true, disabled: !snapshot.original, onSelect: () => {
        restoreText(snapshot);
        if (snapshot.control) snapshot.control.select();
        else { const range = document.createRange(); range.selectNodeContents(target); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
      } },
    ];
    event.preventDefault(); event.stopPropagation();
    openMenu({ x: event.clientX, y: event.clientY, returnFocus: target }, { label: "Text editing", items });
  }

  function fallback(event: ReactMouseEvent) {
    if (event.defaultPrevented) return;
    const definition = typeof defaultMenu === "function" ? defaultMenu() : defaultMenu;
    const selectedText = window.getSelection()?.toString() ?? "";
    const items = [...(definition?.items ?? [])];
    if (selectedText) items.unshift({ id: "copy-selection", label: "Copy selected text", onSelect: async () => {
      if (!navigator.clipboard?.writeText) throw new Error("Use your keyboard copy shortcut with the text selected.");
      await navigator.clipboard.writeText(selectedText);
    } });
    if (!items.length) items.push({ id: "dismiss", label: "Close menu", onSelect: () => {} });
    openMenu(event, { label: definition?.label ?? "Workspace", items });
  }

  return <MenuContext.Provider value={{ openMenu, closeMenu }}>
    <div className="te-context-scope"
      onContextMenuCapture={(event) => { const target = textTarget(event.target); if (target) showTextMenu(event, target); }}
      onContextMenu={fallback}
      onKeyDownCapture={(event) => {
        if (!(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
        if ((event.target as Element).closest('[role="menu"]')) return;
        event.preventDefault(); event.stopPropagation();
        let target = event.target as HTMLElement;
        if (target.classList.contains("te-canvas-editor")) target = target.querySelector<HTMLElement>('[data-layer-id][aria-pressed="true"]') ?? target;
        const bounds = target.getBoundingClientRect();
        target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: Math.max(8, bounds.left + Math.min(24, bounds.width / 2)), clientY: Math.max(8, bounds.top + Math.min(24, bounds.height / 2)) }));
      }}>
      {children}
    </div>
    {menu && createPortal(<div key={menu.sequence} ref={menuRef} className="te-root te-context-menu" role="menu" aria-label={menu.label} tabIndex={-1} style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); closeMenu(); return; }
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
        if (!buttons.length) return;
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        let index = -1;
        if (event.key === "ArrowDown") index = (current + 1) % buttons.length;
        if (event.key === "ArrowUp") index = (current - 1 + buttons.length) % buttons.length;
        if (event.key === "Home") index = 0;
        if (event.key === "End") index = buttons.length - 1;
        if (index >= 0) { event.preventDefault(); buttons[index].focus(); }
      }}>
      <div className="te-context-label">{menu.label}</div>
      {menu.items.map((item) => <div key={item.id} role="none">
        {item.separator && <div className="te-context-separator" role="separator" />}
        <button type="button" role="menuitem" tabIndex={-1} disabled={item.disabled} className={item.danger ? "is-danger" : ""}
          onClick={() => {
            if (item.disabled) return;
            closeMenu();
            try { Promise.resolve(item.onSelect()).catch((error) => setNotice({ text: error instanceof Error ? error.message : "This action could not be completed. Please try again.", portal: menu.portal })); }
            catch (error) { setNotice({ text: error instanceof Error ? error.message : "This action could not be completed. Please try again.", portal: menu.portal }); }
          }}><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>
      </div>)}
    </div>, menu.portal)}
    {notice && createPortal(<div className="te-context-notice" role="status">{notice.text}<button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div>, notice.portal)}
  </MenuContext.Provider>;
}
