// app/appointments/AppointmentsClient.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import AddAppointmentForm from "@/components/appointments/AddAppointmentForm";
import ErrorMessage from "@/components/ui/error-message";
import SuccessMessage from "@/components/ui/success-message";
import LoadingSpinner from "@/components/ui/loading-spinner";
import dayjs from "dayjs";

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
  contacts: Contact;
}

interface AppointmentsClientProps {
  initialAppointments: Appointment[];
  workspaceId: string;
}

export default function AppointmentsClient({ initialAppointments, workspaceId }: AppointmentsClientProps) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      case "scheduled":
        return "bg-[#3351ff]/20 text-[#8096ff]";
      case "confirmed":
        return "bg-green-400/20 text-green-200";
      case "completed":
        return "bg-white/10 text-white/70";
      case "cancelled":
        return "bg-red-400/20 text-red-200";
      default:
        return "bg-white/10 text-white/60";
    }
  };

  return (
    <div className="space-y-6 text-white">
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
        <h2 className="text-lg font-semibold text-white">All Appointments</h2>
        <Button 
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Add Appointment
        </Button>
      </div>

      {showAddForm && (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-white">Add New Appointment</h3>
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
        <div className="rounded-2xl border border-white/10 bg-black/30 p-8 text-center shadow-lg">
          <p className="text-white/70">No appointments yet.</p>
          <p className="mt-2 text-sm text-white/60">Add your first appointment to get started.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-white/80">
              <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-white/50">
                <tr>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Service</th>
                  <th className="px-6 py-3">Date &amp; Time</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {appointments.map((appointment) => (
                  <tr key={appointment.id} className="transition hover:bg-white/5">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#3351ff]/25 text-[#8096ff]">
                          <span className="text-sm font-medium">
                            {appointment.contacts.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-white">
                            {appointment.contacts.name}
                          </div>
                          <div className="text-sm text-white/60">
                            {appointment.contacts.phone}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-white/70">
                      {appointment.service_type}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-white/70">
                      {dayjs(appointment.scheduled_at).format("MMM D, YYYY h:mm A")}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-white/70">
                      {appointment.duration_minutes} min
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(appointment.status)}`}>
                        {appointment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}