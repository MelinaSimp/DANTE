import type { SupabaseClient } from "@supabase/supabase-js";

export interface AssistantAction {
  name: string;
  description: string;
  schema: Record<string, string>;
  execute: (params: {
    supabase: SupabaseClient;
    workspaceId: string;
    userId: string;
    args: Record<string, any>;
  }) => Promise<{ status: "ok" | "error"; data?: any; error?: string }>;
}

async function getWorkspaceProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ workspace_id: string | null }> {
  const { data } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .maybeSingle();
  return data ?? { workspace_id: null };
}

async function ensureWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  table: string,
  id: string
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select("workspace_id")
    .eq("id", id)
    .maybeSingle();
  return data?.workspace_id === workspaceId;
}

async function getContactId(
  supabase: SupabaseClient,
  workspaceId: string,
  args: { contact_id?: string; contact_phone?: string; contact_email?: string; contact_name?: string }
): Promise<{ status: "ok" | "error"; contactId?: string; error?: string }> {
  if (args.contact_id) {
    const exists = await ensureWorkspace(supabase, workspaceId, "contacts", args.contact_id);
    if (!exists) {
      return { status: "error", error: "Contact not found in this workspace." };
    }
    return { status: "ok", contactId: args.contact_id };
  }

  const phone = args.contact_phone ? String(args.contact_phone).trim() : null;
  const email = args.contact_email ? String(args.contact_email).trim() : null;

  if (phone) {
    const { data: byPhone } = await supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("phone", `%${phone}%`)
      .limit(1);

    if (byPhone && byPhone.length > 0) {
      return { status: "ok", contactId: byPhone[0].id };
    }
  }

  if (email) {
    const { data: byEmail } = await supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", email)
      .limit(1);

    if (byEmail && byEmail.length > 0) {
      return { status: "ok", contactId: byEmail[0].id };
    }
  }

  const name = args.contact_name ? String(args.contact_name).trim() : null;
  if (!name) {
    return {
      status: "error",
      error: "Contact details are missing. Provide contact_id or contact_name with phone/email.",
    };
  }

  const payload = {
    workspace_id: workspaceId,
    name,
    phone,
    email,
    company: null,
    notes: null,
  };

  const { data, error } = await supabase
    .from("contacts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    return { status: "error", error: error.message };
  }

  return { status: "ok", contactId: data?.id };
}

export const assistantActions: AssistantAction[] = [
  {
    name: "list_calls",
    description: "List recent receptionist call logs for the workspace.",
    schema: {
      limit: "number (optional, default 10)",
    },
    execute: async ({ supabase, workspaceId, args }) => {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const { data, error } = await supabase
        .from("receptionist_call_logs")
        .select("id, call_sid, from_number, to_number, answers, ai_response, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return { status: "error", error: error.message };
      return { status: "ok", data };
    },
  },
  {
    name: "get_call_details",
    description: "Fetch a specific receptionist call log.",
    schema: {
      call_id: "string (required)",
    },
    execute: async ({ supabase, workspaceId, args }) => {
      const callId = String(args.call_id || "").trim();
      if (!callId) return { status: "error", error: "call_id is required." };

      if (!(await ensureWorkspace(supabase, workspaceId, "receptionist_call_logs", callId))) {
        return { status: "error", error: "Call not found in this workspace." };
      }

      const { data, error } = await supabase
        .from("receptionist_call_logs")
        .select("id, call_sid, from_number, to_number, answers, ai_response, created_at")
        .eq("id", callId)
        .maybeSingle();

      if (error || !data) {
        return { status: "error", error: error?.message || "Call not found." };
      }

      return { status: "ok", data };
    },
  },
  {
    name: "list_contacts",
    description: "List contacts in the workspace.",
    schema: {
      limit: "number (optional, default 15)",
      search: "string (optional, matches name/email/phone)",
    },
    execute: async ({ supabase, workspaceId, args }) => {
      const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 100);
      let query = supabase
        .from("contacts")
        .select("id, name, phone, email, company, notes, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);

      const search = String(args.search || "").trim();
      if (search) {
        query = query.ilike("name", `%${search}%`);
      }

      const { data, error } = await query;
      if (error) return { status: "error", error: error.message };
      return { status: "ok", data };
    },
  },
  {
    name: "create_contact",
    description: "Create a new contact in the workspace.",
    schema: {
      name: "string (required)",
      phone: "string (optional)",
      email: "string (optional)",
      company: "string (optional)",
      notes: "string (optional)",
    },
    execute: async ({ supabase, workspaceId, userId, args }) => {
      const name = String(args.name || "").trim();
      if (!name) return { status: "error", error: "name is required." };

      const payload = {
        workspace_id: workspaceId,
        owner_id: userId,
        name,
        phone: args.phone ? String(args.phone).trim() : null,
        normalized_phone: args.phone ? String(args.phone).trim() : null,
        email: args.email ? String(args.email).trim() : null,
        company: args.company ? String(args.company).trim() : null,
        notes: args.notes ? String(args.notes).trim() : null,
      };

      const { data, error } = await supabase
        .from("contacts")
        .insert(payload)
        .select("id, name, phone, email, company, notes, created_at")
        .single();

      if (error) return { status: "error", error: error.message };
      return { status: "ok", data };
    },
  },
  {
    name: "update_contact",
    description: "Update an existing contact.",
    schema: {
      contact_id: "string (required)",
      name: "string (optional)",
      phone: "string (optional)",
      email: "string (optional)",
      company: "string (optional)",
      notes: "string (optional)",
    },
    execute: async ({ supabase, workspaceId, args }) => {
      const id = String(args.contact_id || "").trim();
      if (!id) return { status: "error", error: "contact_id is required." };

      if (!(await ensureWorkspace(supabase, workspaceId, "contacts", id))) {
        return { status: "error", error: "Contact not found in this workspace." };
      }

      const updates: Record<string, any> = {};
      ["name", "phone", "email", "company", "notes"].forEach((field) => {
        if (args[field] !== undefined) {
          updates[field] = args[field] === null ? null : String(args[field]).trim();
        }
      });

      if (Object.keys(updates).length === 0) {
        return { status: "error", error: "No update fields provided." };
      }

      const { data, error } = await supabase
        .from("contacts")
        .update(updates)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select("id, name, phone, email, company, notes, updated_at")
        .single();

      if (error) return { status: "error", error: error.message };
      return { status: "ok", data };
    },
  },
  {
    name: "list_appointments",
    description: "List upcoming appointments for the workspace.",
    schema: {
      limit: "number (optional, default 10)",
    },
    execute: async ({ supabase, workspaceId, args }) => {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, scheduled_at, duration_minutes, service_type, status, notes, created_at, contacts (id, name, phone)"
        )
        .eq("workspace_id", workspaceId)
        .order("scheduled_at", { ascending: true })
        .limit(limit);

      if (error) return { status: "error", error: error.message };
      return { status: "ok", data };
    },
  },
  {
    name: "create_appointment",
    description:
      "Create an appointment for a contact. Provide either contact_id or enough details to create one (name + phone/email).",
    schema: {
      contact_id: "string (optional)",
      contact_name: "string (required if contact_id missing)",
      contact_phone: "string (optional, used to match existing contact)",
      contact_email: "string (optional, used to match existing contact)",
      scheduled_at: "string ISO timestamp (required)",
      duration_minutes: "number (optional, default 60)",
      service_type: "string (optional)",
      notes: "string (optional)",
      status: "string (optional, e.g., scheduled, confirmed, completed)",
    },
    execute: async ({ supabase, workspaceId, userId, args }) => {
      const scheduledAt = args.scheduled_at ? String(args.scheduled_at).trim() : "";
      if (!scheduledAt) return { status: "error", error: "scheduled_at is required." };

      const contactResult = await getContactId(supabase, workspaceId, {
        contact_id: args.contact_id,
        contact_phone: args.contact_phone,
        contact_email: args.contact_email,
        contact_name: args.contact_name,
      });

      if (contactResult.status === "error" || !contactResult.contactId) {
        return { status: "error", error: contactResult.error || "Unable to resolve contact." };
      }

      const payload = {
        workspace_id: workspaceId,
        contact_id: contactResult.contactId,
        scheduled_at: scheduledAt,
        duration_minutes: args.duration_minutes ? Number(args.duration_minutes) : 60,
        service_type: args.service_type ? String(args.service_type) : null,
        status: args.status ? String(args.status) : "scheduled",
        notes: args.notes ? String(args.notes) : null,
        created_by: userId,
      };

      const { data, error } = await supabase
        .from("appointments")
        .insert(payload)
        .select(
          "id, scheduled_at, duration_minutes, service_type, status, notes, contacts (id, name, phone, email)"
        )
        .single();

      if (error) return { status: "error", error: error.message };
      return { status: "ok", data };
    },
  },
  {
    name: "update_appointment_status",
    description: "Update the status or details for an appointment.",
    schema: {
      appointment_id: "string (required)",
      status: "string (optional, e.g., scheduled, confirmed, completed, cancelled)",
      notes: "string (optional)",
      scheduled_at: "string (optional ISO timestamp)",
    },
    execute: async ({ supabase, workspaceId, args }) => {
      const appointmentId = String(args.appointment_id || "").trim();
      if (!appointmentId) return { status: "error", error: "appointment_id is required." };

      if (!(await ensureWorkspace(supabase, workspaceId, "appointments", appointmentId))) {
        return { status: "error", error: "Appointment not found in this workspace." };
      }

      const updates: Record<string, any> = {};
      ["status", "notes", "scheduled_at"].forEach((field) => {
        if (args[field] !== undefined) updates[field] = args[field];
      });

      if (Object.keys(updates).length === 0) {
        return { status: "error", error: "No update fields provided." };
      }

      const { data, error } = await supabase
        .from("appointments")
        .update(updates)
        .eq("id", appointmentId)
        .eq("workspace_id", workspaceId)
        .select(
          "id, scheduled_at, duration_minutes, service_type, status, notes, contacts (id, name, phone)"
        )
        .single();

      if (error) return { status: "error", error: error.message };
      return { status: "ok", data };
    },
  },
  {
    name: "list_knowledge_entries",
    description: "List AI knowledge base entries.",
    schema: {
      limit: "number (optional, default 20)",
      category: "string (optional)",
    },
    execute: async ({ supabase, workspaceId, args }) => {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      let query = supabase
        .from("knowledge_base")
        .select("id, category, title, content, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (args.category) {
        query = query.eq("category", String(args.category));
      }

      const { data, error } = await query;
      if (error) return { status: "error", error: error.message };
      return { status: "ok", data };
    },
  },
  {
    name: "create_knowledge_entry",
    description: "Create a new knowledge base entry.",
    schema: {
      category: "string (required)",
      title: "string (required)",
      content: "string (required)",
    },
    execute: async ({ supabase, workspaceId, args }) => {
      const category = String(args.category || "").trim();
      const title = String(args.title || "").trim();
      const content = String(args.content || "").trim();
      if (!category || !title || !content) {
        return { status: "error", error: "category, title, and content are required." };
      }

      const { data, error } = await supabase
        .from("knowledge_base")
        .insert({
          workspace_id: workspaceId,
          category,
          title,
          content,
        })
        .select("id, category, title, content, created_at")
        .single();

      if (error) return { status: "error", error: error.message };
      return { status: "ok", data };
    },
  },
  {
    name: "update_knowledge_entry",
    description: "Update an existing knowledge base entry.",
    schema: {
      entry_id: "string (required)",
      category: "string (optional)",
      title: "string (optional)",
      content: "string (optional)",
    },
    execute: async ({ supabase, workspaceId, args }) => {
      const id = String(args.entry_id || "").trim();
      if (!id) return { status: "error", error: "entry_id is required." };

      if (!(await ensureWorkspace(supabase, workspaceId, "knowledge_base", id))) {
        return { status: "error", error: "Entry not found in this workspace." };
      }

      const updates: Record<string, any> = {};
      if (args.category !== undefined) updates.category = String(args.category);
      if (args.title !== undefined) updates.title = String(args.title);
      if (args.content !== undefined) updates.content = String(args.content);

      if (Object.keys(updates).length === 0) {
        return { status: "error", error: "No update fields provided." };
      }

      const { data, error } = await supabase
        .from("knowledge_base")
        .update(updates)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select("id, category, title, content, updated_at")
        .single();

      if (error) return { status: "error", error: error.message };
      return { status: "ok", data };
    },
  },
  {
    name: "delete_knowledge_entry",
    description: "Delete a knowledge base entry.",
    schema: {
      entry_id: "string (required)",
    },
    execute: async ({ supabase, workspaceId, args }) => {
      const id = String(args.entry_id || "").trim();
      if (!id) return { status: "error", error: "entry_id is required." };

      if (!(await ensureWorkspace(supabase, workspaceId, "knowledge_base", id))) {
        return { status: "error", error: "Entry not found in this workspace." };
      }

      const { error } = await supabase
        .from("knowledge_base")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);

      if (error) return { status: "error", error: error.message };
      return { status: "ok", data: { deleted: id } };
    },
  },
];

export const actionCatalogText = assistantActions
  .map((action) => {
    const schema = Object.entries(action.schema)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join("\n");
    return `Action: ${action.name}\nDescription: ${action.description}\nArguments:\n${schema || "- none"}`;
  })
  .join("\n\n");

export async function getWorkspaceIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const profile = await getWorkspaceProfile(supabase, userId);
  return profile?.workspace_id ?? null;
}

