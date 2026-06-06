// app/api/search/route.ts
//
// Unified workspace-wide search powering the ⌘K global search modal.
// Runs ilike across the surfaces a user is likely to look for —
// contacts, properties, vault items, vault projects, review tables,
// library prompts, reminders. Returns a flat array of result rows
// the modal renders grouped by kind.
//
// We keep the per-table queries small and parallel; if any single
// query errors out, we silently drop it from the result set so a
// missing table (e.g. a workspace that hasn't run a particular
// migration) doesn't break search.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export type SearchKind =
  | "vault_item"
  | "vault_project"
  | "property"
  | "contact"
  | "library_prompt"
  | "review_table"
  | "reminder";

export interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  href: string;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ results: [] });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ results: [] });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const wid = profile.workspace_id;
  const limit = q.length < 2 ? 4 : 8;
  // When the user opens ⌘K without typing, return recent items
  // across the same surfaces — orders by updated_at on each table —
  // so the modal feels useful immediately. Anything ≥ 2 chars
  // switches into ilike search mode.
  const isRecent = q.length < 2;
  const like = `%${q}%`;

  // Each query awaited with try/catch — a missing table (workspace
  // hasn't run a particular migration) shouldn't break search. The
  // builder objects from supabase-js are thenable but not declared
  // as Promise, so we cast on the way in.
  const safe = async (
    fn: () => any
  ): Promise<Array<Record<string, any>>> => {
    try {
      const r = await fn();
      return (r?.data ?? []) as Array<Record<string, any>>;
    } catch {
      return [];
    }
  };

  type Row = Record<string, any>;
  const [contacts, properties, vaultItems, vaultProjects, prompts, tables, reminders] =
    await Promise.all([
      safe(() => {
        const base = supabase
          .from("contacts")
          .select("id, name, email, phone")
          .eq("workspace_id", wid)
          .limit(limit);
        return isRecent
          ? base.order("created_at", { ascending: false })
          : base.or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
      }),
      safe(() => {
        const base = supabase
          .from("properties")
          .select("id, address_line1, city, state, updated_at")
          .eq("workspace_id", wid)
          .limit(limit);
        return isRecent
          ? base.order("updated_at", { ascending: false })
          : base.or(`address_line1.ilike.${like},city.ilike.${like}`);
      }),
      safe(() => {
        const base = supabase
          .from("vault_items")
          .select("id, title, description, kind, updated_at")
          .eq("workspace_id", wid)
          .limit(limit);
        return isRecent
          ? base.order("updated_at", { ascending: false })
          : base.or(`title.ilike.${like},description.ilike.${like}`);
      }),
      safe(() => {
        const base = supabase
          .from("vault_projects")
          .select("id, name, description, updated_at")
          .eq("workspace_id", wid)
          .limit(limit);
        return isRecent
          ? base.order("updated_at", { ascending: false })
          : base.or(`name.ilike.${like},description.ilike.${like}`);
      }),
      safe(() => {
        const base = supabase
          .from("library_prompts")
          .select("id, title, description, updated_at")
          .eq("workspace_id", wid)
          .limit(limit);
        return isRecent
          ? base.order("updated_at", { ascending: false })
          : base.or(`title.ilike.${like},prompt.ilike.${like},description.ilike.${like}`);
      }),
      safe(() => {
        const base = supabase
          .from("review_tables")
          .select("id, title, status, updated_at")
          .eq("workspace_id", wid)
          .limit(limit);
        return isRecent
          ? base.order("updated_at", { ascending: false })
          : base.ilike("title", like);
      }),
      safe(() => {
        const base = supabase
          .from("reminders")
          .select("id, subject, status, updated_at")
          .eq("workspace_id", wid)
          .limit(limit);
        return isRecent
          ? base.order("updated_at", { ascending: false })
          : base.or(`subject.ilike.${like},body.ilike.${like}`);
      }),
    ]);

  const results: SearchResult[] = [];

  for (const c of contacts) {
    results.push({
      id: c.id,
      kind: "contact",
      title: c.name || c.email || "(no name)",
      subtitle: c.email || c.phone || undefined,
      href: `/contacts?contactId=${c.id}`,
    });
  }
  for (const p of properties) {
    results.push({
      id: p.id,
      kind: "property",
      title: p.address_line1,
      subtitle: [p.city, p.state].filter(Boolean).join(", ") || undefined,
      href: `/properties/${p.id}`,
    });
  }
  for (const v of vaultProjects) {
    results.push({
      id: v.id,
      kind: "vault_project",
      title: v.name,
      subtitle: v.description || undefined,
      href: `/vault/projects/${v.id}`,
    });
  }
  for (const v of vaultItems) {
    results.push({
      id: v.id,
      kind: "vault_item",
      title: v.title,
      subtitle: v.kind === "template" ? "Template" : "Document",
      href: `/vault/${v.id}`,
    });
  }
  for (const t of tables) {
    results.push({
      id: t.id,
      kind: "review_table",
      title: t.title,
      subtitle: t.status || undefined,
      href: `/review-tables/${t.id}`,
    });
  }
  for (const p of prompts) {
    results.push({
      id: p.id,
      kind: "library_prompt",
      title: p.title,
      subtitle: p.description || undefined,
      href: `/library`,
    });
  }
  for (const r of reminders) {
    results.push({
      id: r.id,
      kind: "reminder",
      title: r.subject || "(no subject)",
      subtitle: r.status || undefined,
      href: `/reminders`,
    });
  }

  return NextResponse.json({ results, mode: isRecent ? "recent" : "search" });
}
