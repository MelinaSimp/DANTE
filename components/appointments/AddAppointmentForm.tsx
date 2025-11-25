"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSimpleAppointment } from "@/app/appointments/actions";
import dayjs from "dayjs";

interface AddAppointmentFormProps {
  workspaceId: string;
  onAppointmentAdded: (appointment: any) => void;
  onError: (error: string) => void;
  onCancel: () => void;
}

export default function AddAppointmentForm({ workspaceId, onAppointmentAdded, onError, onCancel }: AddAppointmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const result = await createSimpleAppointment(formData, workspaceId);
      
      if (result.success && result.appointment) {
        onAppointmentAdded(result.appointment);
      } else {
        const errorMessage = result.error || "Failed to create appointment";
        setError(errorMessage);
        onError(errorMessage);
      }
    } catch (err) {
      const errorMessage = "An unexpected error occurred. Please try again.";
      setError(errorMessage);
      onError(errorMessage);
      console.error("Appointment creation error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Default to tomorrow at 10 AM
  const defaultDateTime = dayjs().add(1, 'day').hour(10).minute(0).format('YYYY-MM-DDTHH:mm');

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="client_name" className="block text-sm font-medium text-gray-700 mb-1">
            Client Name *
          </label>
          <input
            type="text"
            id="client_name"
            name="client_name"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="John Doe"
          />
        </div>

        <div>
          <label htmlFor="client_phone" className="block text-sm font-medium text-gray-700 mb-1">
            Client Phone *
          </label>
          <input
            type="tel"
            id="client_phone"
            name="client_phone"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="scheduled_at" className="block text-sm font-medium text-gray-700 mb-1">
            Date & Time *
          </label>
          <input
            type="datetime-local"
            id="scheduled_at"
            name="scheduled_at"
            required
            defaultValue={defaultDateTime}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="service_type" className="block text-sm font-medium text-gray-700 mb-1">
            Service Type *
          </label>
          <select
            id="service_type"
            name="service_type"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select service type</option>
            <option value="Plumbing Repair">Plumbing Repair</option>
            <option value="Drain Cleaning">Drain Cleaning</option>
            <option value="Water Heater">Water Heater</option>
            <option value="Pipe Installation">Pipe Installation</option>
            <option value="Emergency Service">Emergency Service</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Additional details about the appointment..."
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isSubmitting ? "Creating..." : "Create Appointment"}
        </Button>
        
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
