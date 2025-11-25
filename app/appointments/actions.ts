// app/appointments/actions.ts
"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import dayjs from "dayjs";

export async function createSimpleAppointment(formData: FormData, workspaceId: string) {
  try {
    const supabase = await createServerSupabase();
    
    // Get form data
    const clientName = formData.get("client_name") as string;
    const clientPhone = formData.get("client_phone") as string;
    const scheduledAt = formData.get("scheduled_at") as string;
    const serviceType = formData.get("service_type") as string;
    const notes = formData.get("notes") as string;

    if (!clientName || !clientPhone || !scheduledAt || !serviceType) {
      return { success: false, error: "All required fields must be filled" };
    }

    // Validate phone number format
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = clientPhone.replace(/\D/g, '');
    
    if (cleanPhone.length < 10) {
      return { success: false, error: "Please enter a valid phone number" };
    }

    // Format phone number to E.164
    let formattedPhone = cleanPhone;
    if (cleanPhone.length === 10) {
      formattedPhone = `+1${cleanPhone}`;
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
      formattedPhone = `+${cleanPhone}`;
    } else {
      formattedPhone = `+${cleanPhone}`;
    }

    // Validate date is not in the past
    const appointmentDate = dayjs(scheduledAt);
    if (appointmentDate.isBefore(dayjs(), 'minute')) {
      return { success: false, error: "Appointment date cannot be in the past" };
    }

    // Check if contact exists, create if not
    let contactId: string;
    
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("phone", formattedPhone)
      .single();

    if (existingContact) {
      contactId = existingContact.id;
      
      // Update contact name if it's empty or different
      await supabase
        .from("contacts")
        .update({ name: clientName })
        .eq("id", contactId);
    } else {
      // Create new contact
      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          workspace_id: workspaceId,
          name: clientName,
          phone: formattedPhone,
        })
        .select("id")
        .single();

      if (contactError) {
        console.error("Contact creation error:", contactError);
        return { success: false, error: "Failed to create contact" };
      }

      contactId = newContact.id;
    }

    // Create appointment
    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        scheduled_at: scheduledAt,
        duration_minutes: 60, // Default 1 hour
        service_type: serviceType,
        status: "scheduled",
        notes: notes || null,
      })
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        service_type,
        status,
        notes,
        contacts (
          id,
          name,
          phone
        )
      `)
      .single();

    if (appointmentError) {
      console.error("Appointment creation error:", appointmentError);
      return { success: false, error: "Failed to create appointment" };
    }

    return { success: true, appointment };
  } catch (error) {
    console.error("Unexpected error in createSimpleAppointment:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}
