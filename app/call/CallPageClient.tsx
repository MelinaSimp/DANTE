"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import CallRecorder from "@/components/call/CallRecorder";
import ZoomLauncher from "@/components/call/ZoomLauncher";

type Contact = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};

export default function CallPageClient({
  contacts,
  initialContactId,
}: {
  contacts: Contact[];
  initialContactId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Contact | null>(
    initialContactId
      ? contacts.find((c) => c.id === initialContactId) || null
      : null
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
    );
  }, [contacts, query]);

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="label-section">New call recording</p>
            <h1 className="heading-display mt-1 text-4xl text-[var(--ink)]">
              {picked ? picked.name : "Pick a client"}
            </h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {picked
                ? "Record the call — we'll transcribe and summarize into their notes."
                : "Search your clients, then start recording."}
            </p>
          </div>
          <Link
            href={picked ? "/call" : "/dashboard"}
            onClick={(e) => {
              if (picked) {
                e.preventDefault();
                setPicked(null);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            {picked ? "Back to clients" : "Dashboard"}
          </Link>
        </div>

        {!picked ? (
          <>
            <div className="relative mb-4">
              <Search
                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-subtle)]"
                strokeWidth={1.5}
              />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients by name, email, or phone…"
                className="w-full rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] py-3 pl-11 pr-4 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="card-flat p-12 text-center text-sm text-[var(--ink-muted)]">
                {contacts.length === 0
                  ? "No clients in your workspace yet. Add one from the Contacts page."
                  : "No clients match that search."}
              </div>
            ) : (
              <ul className="card-flat divide-y divide-[var(--rule)] overflow-hidden p-0">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setPicked(c)}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-[var(--canvas-subtle)]"
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-medium text-[var(--accent)]">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[var(--ink)]">
                          {c.name}
                        </div>
                        <div className="truncate text-xs text-[var(--ink-muted)]">
                          {[c.email, c.phone].filter(Boolean).join(" · ") ||
                            "No contact info"}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-[var(--accent)]">
                        Record →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <CallRecorder contact={picked} />
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 border-t border-[var(--rule)]" />
              <span className="text-xs text-[var(--ink-subtle)] uppercase tracking-wide">
                or
              </span>
              <div className="flex-1 border-t border-[var(--rule)]" />
            </div>
            <ZoomLauncher contact={picked} />
          </div>
        )}
      </div>
    </div>
  );
}
