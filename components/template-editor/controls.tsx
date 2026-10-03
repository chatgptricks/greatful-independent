"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/grateful-future/icons";

export const FONTS = [
  ["geist", "Geist Sans"],
  ["inter", "Inter"],
  ["space", "Space Grotesk"],
  ["montserrat", "Montserrat"],
  ["libre", "Libre Baskerville"],
  ["playfair", "Playfair Display"],
  ["dmserif", "DM Serif Display"],
  ["lora", "Lora"],
  ["cormorant", "Cormorant"],
  ["crimson", "Crimson Text"],
  ["bebas", "Bebas Neue"],
  ["plexmono", "IBM Plex Mono"],
  ["caveat", "Caveat"],
];

export function FontSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="te-field">
      Typeface
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {FONTS.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="te-color-field">
      <span>{label}</span>
      <span>
        <input
          aria-label={label}
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
        />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}
export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="te-range">
      <span>
        {label}
        <output>
          {Number(value.toFixed(2))}
          {unit}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      className="te-modal"
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="te-modal-head">
        <h2>{title}</h2>
        <button className="te-icon" onClick={onClose} aria-label="Close dialog">
          <CloseIcon />
        </button>
      </div>
      {children}
    </dialog>
  );
}
