"use client";

// Harvey-styled date picker. Thin wrapper around react-day-picker v9
// that renders a button trigger (shows the chosen date or placeholder)
// and a small calendar popover on click. Values are exchanged as
// "yyyy-mm-dd" strings so it's a drop-in replacement for native
// <input type="date">.

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { Calendar as CalendarIcon } from "lucide-react";
import dayjs from "dayjs";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export default function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = value ? dayjs(value).toDate() : undefined;
  const display = value ? dayjs(value).format("MMM D, YYYY") : "";

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-[4px] border border-[var(--rule-strong)] bg-[var(--canvas)] px-3 py-2 text-sm text-left hover:border-[var(--ink)] transition"
      >
        <CalendarIcon
          className="w-3.5 h-3.5 shrink-0 text-[var(--ink-muted)]"
          strokeWidth={1.5}
        />
        <span className={display ? "text-[var(--ink)]" : "text-[var(--ink-subtle)]"}>
          {display || placeholder}
        </span>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 p-2 bg-[var(--canvas)] border border-[var(--rule-strong)] rounded-[6px]"
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (!d) return;
              onChange(dayjs(d).format("YYYY-MM-DD"));
              setOpen(false);
            }}
            showOutsideDays
            classNames={{
              root: "rdp-harvey",
              months: "flex",
              month: "p-1",
              month_caption: "flex items-center justify-center h-9 text-sm font-semibold text-[var(--ink)]",
              caption_label: "text-sm font-semibold",
              nav: "absolute top-1 right-1 flex items-center gap-1",
              button_previous:
                "inline-flex items-center justify-center w-7 h-7 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)] transition",
              button_next:
                "inline-flex items-center justify-center w-7 h-7 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)] transition",
              month_grid: "border-collapse",
              weekdays: "flex",
              weekday:
                "w-8 h-7 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-subtle)] flex items-center justify-center",
              week: "flex",
              day: "w-8 h-8 p-0 text-center text-sm",
              day_button:
                "w-8 h-8 rounded-[4px] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition inline-flex items-center justify-center",
              selected:
                "[&>button]:bg-[var(--ink)] [&>button]:text-[var(--canvas)] [&>button:hover]:bg-[var(--ink)]",
              today: "[&>button]:font-semibold [&>button]:underline",
              outside: "[&>button]:text-[var(--ink-subtle)]",
              disabled: "[&>button]:opacity-30 [&>button]:cursor-not-allowed",
            }}
          />
        </div>
      )}
    </div>
  );
}
