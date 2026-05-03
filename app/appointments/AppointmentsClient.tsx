// app/appointments/AppointmentsClient.tsx
"use client";

import { useState } from "react";
import AddAppointmentForm from "@/components/appointments/AddAppointmentForm";
import ErrorMessage from "@/components/ui/error-message";
import SuccessMessage from "@/components/ui/success-message";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "lucide-react";
import dayjs from "dayjs";
import { useIsRealtor } from "@/lib/industry/use-industry";
import { RealtorToursEmpty } from "@/components/empty-states/RealtorEmptyStates";

interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface Appointment {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  service_type: string;
  status: string;
  notes: string;
  // Nullable: AI-booked calls from unrecognized numbers leave contacts
  // unset and stash what we heard on the row itself.
  contacts: Contact | Contact[] | null;
  caller_name?: string | null;
  caller_phone?: string | null;
}

interface AppointmentsClientProps {
  initialAppointments: Appointment[];
  workspaceId: string;
}

export default function AppointmentsClient({ initialAppointments, workspaceId }: AppointmentsClientProps) {
  const isRealtor = useIsRealtor();
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading] = useState(false);

  const handleAppointmentAdded = (newAppointment: Appointment) => {
    setAppointments(prev => [...prev, newAppointment].sort((a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ));
    setShowAddForm(false);
    setError(null);
    setSuccess("Appointment created successfully!");
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setSuccess(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-[var(--flag-soft)] text-[var(--flag)]";
      case "scheduled":
        return "bg-[var(--accent-soft)] text-[var(--accent)]";
      case "confirmed":
        return "bg-[var(--verified-soft)] text-[var(--verified)]";
      case "completed":
        return "bg-[var(--verified-soft)] text-[var(--verified)]";
      case "cancelled":
        return "bg-[var(--danger-soft)] text-[var(--danger)]";
      default:
        return "bg-[var(--canvas-subtle)] text-[var(--ink-muted)]";
    }
  };

  return (
    <div className="space-y-6 text-[var(--ink)]">
      {/* Error and Success Messages */}
      {error && (
        <ErrorMessage
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {success && (
        <SuccessMessage
          message={success}
          onDismiss={() => setSuccess(null)}
        />
      )}

      <div className="flex justify-between items-center">
        <h2 className="label-section text-[var(--ink-muted)]">All Appointments</h2>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="bg-[var(--ink)] text-[var(--canvas)] border border-[var(--ink)] px-4 py-2 rounded-[4px] text-sm font-medium hover:bg-[var(--ink)]/90"
        >
          Add Appointment
        </button>
      </div>

      {showAddForm && (
        <div className="card-flat p-5">
          <h3 className="mb-4 text-lg font-semibold text-[var(--ink)]">Add New Appointment</h3>
          <AddAppointmentForm
            workspaceId={workspaceId}
            onAppointmentAdded={handleAppointmentAdded}
            onError={handleError}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="lg" text="Loading appointments..." />
        </div>
      ) : appointments.length === 0 ? (
        isRealtor ? (
          <div className="card-flat">
            <RealtorToursEmpty />
          </div>
        ) : (
          <div className="card-flat p-8">
            <EmptyState
              icon={CalendarDays}
              theme="light"
              title="No appointments yet"
              description="Schedule your first appointment to start tracking client meetings, calls, and visits in one place."
              action={{
                label: "Add appointment",
                onClick: () => setShowAddForm(true),
              }}
            />
          </div>
        )
      ) : (
        <div className="card-flat overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[var(--ink)]">
              <thead className="border-b border-[var(--rule)] bg-[var(--canvas-subtle)] text-xs uppercase tracking-wider text-[var(--ink-muted)]">
                <tr>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Service</th>
                  <th className="px-6 py-3">Date &amp; Time</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule)]">
                {appointments.map((appointment) => {
                  const contact = Array.isArray(appointment.contacts) ? appointment.contacts[0] : appointment.contacts;
                  // Unknown-caller fallback: we didn't match a contact,
                  // but we captured the heard name + phone on the appt.
                  const displayName = contact?.name ?? (appointment.caller_name?.trim() ? `Unknown · ${appointment.caller_name}` : "Unknown caller");
                  const displayPhone = contact?.phone ?? appointment.caller_phone ?? "—";
                  const avatarChar = contact?.name?.charAt(0)?.toUpperCase() ?? "?";
                  return (
                  <tr key={appointment.id} className="transition hover:bg-[var(--canvas-subtle)]">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center">
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${contact ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--canvas-subtle)] text-[var(--ink-subtle)]"}`}>
                          <span className="text-sm font-medium">
                            {avatarChar}
                          </span>
                        </div>
                        <div className="ml-3">
                          <div className={`text-sm font-medium ${contact ? "text-[var(--ink)]" : "text-[var(--ink-muted)] italic"}`}>
                            {displayName}
                          </div>
                          <div className="text-sm text-[var(--ink-muted)]">
                            {displayPhone}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--ink-muted)]">
                      {appointment.service_type}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="mono text-sm text-[var(--ink-muted)]">
                        {dayjs(appointment.scheduled_at).format("MMM D, YYYY h:mm A")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="mono text-sm text-[var(--ink-muted)]">
                        {appointment.duration_minutes} min
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`inline-flex rounded-[4px] px-2 py-1 text-xs font-medium ${getStatusColor(appointment.status)}`}>
                        {appointment.status}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
