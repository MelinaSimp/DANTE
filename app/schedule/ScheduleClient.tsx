// app/schedule/ScheduleClient.tsx
"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Plus, X, Calendar, Clock, User, Phone, FileText } from "lucide-react";

interface Appointment {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  service_type: string;
  status: string;
  notes?: string;
  contacts: {
    id: string;
    name: string;
    phone: string;
  };
}

interface ScheduleClientProps {
  initialAppointments: Appointment[];
  workspaceId: string;
}

type LocalAppointment = Appointment & { localTime: dayjs.Dayjs };

export default function ScheduleClient({ initialAppointments, workspaceId }: ScheduleClientProps) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [showDayView, setShowDayView] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [formTime, setFormTime] = useState(dayjs().add(1, "hour").format("HH:mm"));
  const [formDuration, setFormDuration] = useState("60");

  // Group appointments by date
  const normalizedAppointments: LocalAppointment[] = appointments.map((appointment) => {
    let parsed = dayjs(appointment.scheduled_at);
    if (!parsed.isValid()) {
      parsed = dayjs(`${appointment.scheduled_at}Z`);
    }
    if (!parsed.isValid()) {
      parsed = dayjs(Number(appointment.scheduled_at));
    }
    return {
      ...appointment,
      localTime: parsed,
    };
  });

  const appointmentsByDate = normalizedAppointments.reduce((acc, appointment) => {
    const date = appointment.localTime.startOf("day").format("YYYY-MM-DD");
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(appointment);
    return acc;
  }, {} as Record<string, Array<Appointment & { localTime: dayjs.Dayjs }>>);

  const normalizedSelectedDate = selectedDate.startOf("day");
  const selectedKey = normalizedSelectedDate.format("YYYY-MM-DD");
  const rawDayAppointments = appointmentsByDate[selectedKey] || [];
  const todayAppointments = rawDayAppointments
    .slice()
    .sort((a, b) => a.localTime.valueOf() - b.localTime.valueOf());
  const dailyAppointments = todayAppointments;

  // Handle create appointment
  const handleCreateAppointment = async () => {
    if (!formName.trim() || !formPhone.trim() || !formDescription.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    setCreating(true);
    try {
      // Combine date and time
      const scheduledAt = dayjs(`${formDate} ${formTime}`).toISOString();

      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          phoneNumber: formPhone.trim(),
          description: formDescription.trim(),
          scheduledAt,
          durationMinutes: parseInt(formDuration) || 60,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create appointment");
      }

      const data = await response.json();
      
      // Reset form
      setFormName("");
      setFormPhone("");
      setFormDescription("");
      setFormDate(dayjs().format("YYYY-MM-DD"));
      setFormTime(dayjs().add(1, "hour").format("HH:mm"));
      setFormDuration("60");
      setShowCreateModal(false);
      
      // Reload page to show new appointment
      window.location.reload();
    } catch (error: any) {
      console.error("Failed to create appointment:", error);
      alert(error.message || "Failed to create appointment");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6 text-white p-6 overflow-y-auto relative">
      {/* Floating Create Button - Always visible */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-8 right-8 z-50 px-6 py-3 rounded-full bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition flex items-center gap-2 shadow-2xl hover:scale-105"
        style={{ boxShadow: '0 10px 40px rgba(59, 130, 246, 0.5)' }}
      >
        <Plus className="h-6 w-6" />
        Create Appointment
      </button>

      <div className="max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Schedule</h2>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#242423]/90 backdrop-blur-sm p-6">
      {/* View Toggle */}
      <div className="flex items-center gap-4">
        <div className="flex rounded-2xl border border-white/10 bg-white/5 p-1">
          <button
            onClick={() => {
              setView("calendar");
              setShowDayView(false);
            }}
            className={`px-3 py-1 rounded-2xl text-sm font-medium transition-colors ${
              view === "calendar"
                ? "bg-white text-gray-900 shadow-md"
                : "text-white/70 hover:text-white"
            }`}
          >
            Calendar
          </button>
          <button
            onClick={() => {
              setView("list");
              setShowDayView(false);
            }}
            className={`px-3 py-1 rounded-2xl text-sm font-medium transition-colors ${
              view === "list"
                ? "bg-white text-gray-900 shadow-md"
                : "text-white/70 hover:text-white"
            }`}
          >
            List
          </button>
        </div>
        
        {showDayView && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDayView(false)}
              className="px-3 py-1 text-sm rounded-2xl bg-white/10 text-white/80 hover:bg-white/15"
            >
              ← Back to Calendar
            </button>
            <span className="text-sm text-white/70">
              {selectedDate.format("dddd, MMMM D, YYYY")}
            </span>
          </div>
        )}
      </div>

      {showDayView ? (
        /* Google Calendar-style Day View */
        <div className="rounded-2xl border border-white/10 bg-black/40 shadow-lg">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                {selectedDate.format("dddd, MMMM D, YYYY")}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedDate(selectedDate.subtract(1, "day"))}
                  className="p-2 rounded-2xl border border-white/10 text-white/70 hover:bg-white/10"
                >
                  ←
                </button>
                <button
                  onClick={() => setSelectedDate(dayjs())}
                  className="px-3 py-1 text-sm rounded-2xl bg-[#3351ff] text-white hover:bg-[#4a64ff]"
                >
                  Today
                </button>
                <button
                  onClick={() => setSelectedDate(selectedDate.add(1, "day"))}
                  className="p-2 rounded-2xl border border-white/10 text-white/70 hover:bg-white/10"
                >
                  →
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            {/* Time labels */}
            <div className="absolute left-0 top-0 w-16 h-full border-r border-white/10">
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="h-12 border-b border-white/5 flex items-start justify-end pr-2">
                  <span className="mt-1 text-xs text-white/40">
                    {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                  </span>
                </div>
              ))}
            </div>

            {/* Time slots */}
            <div className="ml-16 relative">
              {Array.from({ length: 24 }, (_, hour) => {
                const hourAppointments = dailyAppointments.filter(
                  (appt) => appt.localTime.hour() === hour
                );

                return (
                  <div key={hour} className="relative h-12 border-b border-white/5">
                    {hourAppointments.map((appointment) => {
                      const minutes = appointment.localTime.minute();
                      const topOffset = (minutes / 60) * 48; // 48px = height of hour slot
                      const duration = appointment.duration_minutes || 60;
                      const height = Math.max(36, (duration / 60) * 48);
                      
                      return (
                        <div
                          key={appointment.id}
                          className="absolute left-0 right-0 rounded-2xl border border-[#3351ff]/40 bg-[#3351ff]/20 p-2 shadow-sm transition hover:shadow-lg"
                          style={{ top: `${topOffset}px`, height: `${height}px` }}
                        >
                          <div className="flex items-center justify-between h-full">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white truncate">
                                {appointment.contacts.name}
                              </div>
                              <div className="text-xs text-white/70 truncate">
                                {appointment.service_type}
                              </div>
                            </div>
                            <div className="ml-2 flex-shrink-0">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                appointment.status === "confirmed" 
                                  ? "bg-green-400/20 text-green-200"
                                  : appointment.status === "pending"
                                  ? "bg-yellow-400/20 text-yellow-200"
                                  : "bg-white/10 text-white/60"
                              }`}>
                                {appointment.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : view === "calendar" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 flex-1 min-h-0">
          {/* Calendar */}
          <div className="lg:col-span-2 flex flex-col min-h-0">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg flex-1 flex flex-col min-h-0">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  {selectedDate.format("MMMM YYYY")}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedDate(selectedDate.subtract(1, "month"))}
                    className="rounded-2xl border border-white/10 p-2 text-white/70 hover:bg-white/10"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => setSelectedDate(dayjs())}
                    className="rounded-2xl bg-[#3351ff] px-3 py-1 text-sm text-white hover:bg-[#4a64ff]"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setSelectedDate(selectedDate.add(1, "month"))}
                    className="rounded-2xl border border-white/10 p-2 text-white/70 hover:bg-white/10"
                  >
                    →
                  </button>
                </div>
              </div>

              {/* Month Calendar Grid */}
              <div className="mb-3 grid grid-cols-7 gap-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="p-2 text-center text-sm font-semibold text-white/60">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2 flex-1 auto-rows-fr">
                {Array.from({ length: selectedDate.daysInMonth() }, (_, i) => {
                  const day = i + 1;
                  const date = selectedDate.date(day);
                  const dateStr = date.format("YYYY-MM-DD");
                  const dayAppointments = appointmentsByDate[dateStr] || [];
                  const isToday = date.isSame(dayjs(), "day");
                  const isSelected = date.isSame(selectedDate, "day");

                  return (
                    <button
                      key={day}
                      onClick={() => {
                        setSelectedDate(date);
                        setShowDayView(true);
                      }}
                      className={`rounded-2xl p-4 text-sm transition min-h-[80px] flex flex-col items-center justify-start ${
                        isToday ? "bg-[#3351ff]/25 text-[#7a8dff]" : ""
                      } ${isSelected ? "border-2 border-[#3351ff] bg-[#3351ff]/30 text-white" : "hover:bg-white/10 border border-white/5"}`}
                    >
                      <div className="text-center font-medium text-base mb-1">{day}</div>
                      {dayAppointments.length > 0 && (
                        <div className="mt-auto text-xs text-[#7a8dff] font-semibold">
                          {dayAppointments.length} appt{dayAppointments.length > 1 ? "s" : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected Date Details */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
              <h3 className="mb-4 text-lg font-semibold text-white">
                {selectedDate.format("dddd, MMMM D")}
              </h3>
              
              {todayAppointments.length === 0 ? (
                <p className="text-sm text-white/50">No appointments scheduled</p>
              ) : (
                <div className="space-y-3">
                  {todayAppointments.map((appointment) => (
                      <div key={appointment.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-medium text-white">
                            {appointment.localTime.format("h:mm A")}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            appointment.status === "confirmed" 
                              ? "bg-green-400/20 text-green-200"
                              : appointment.status === "pending"
                              ? "bg-yellow-400/20 text-yellow-200"
                              : "bg-white/10 text-white/60"
                          }`}>
                            {appointment.status}
                          </span>
                        </div>
                        <div className="text-sm text-white/70">
                          <div className="font-medium text-white">{appointment.contacts.name}</div>
                          <div>{appointment.contacts.phone}</div>
                          <div className="text-white/60">{appointment.service_type}</div>
                        </div>
                      </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* List View */
        <div className="rounded-2xl border border-white/10 bg-black/40 shadow-lg">
          <div className="border-b border-white/10 p-6">
            <h2 className="text-lg font-semibold text-white">All Appointments</h2>
          </div>
          
          <div className="divide-y divide-white/10">
            {appointments.length === 0 ? (
              <div className="p-6 text-center text-white/60">
                No appointments scheduled
              </div>
            ) : (
              normalizedAppointments.map((appointment) => (
                <div key={appointment.id} className="p-6 transition hover:bg-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4">
                        <div className="text-sm font-medium text-white">
                          {appointment.localTime.format("MMM D, YYYY h:mm A")}
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          appointment.status === "confirmed" 
                            ? "bg-green-400/20 text-green-200"
                            : appointment.status === "pending"
                            ? "bg-yellow-400/20 text-yellow-200"
                            : "bg-white/10 text-white/60"
                        }`}>
                          {appointment.status}
                        </span>
                      </div>
                      <div className="mt-2">
                        <div className="font-medium text-white">{appointment.contacts.name}</div>
                        <div className="text-sm text-white/70">{appointment.contacts.phone}</div>
                        <div className="text-sm text-white/60">{appointment.service_type}</div>
                        {appointment.notes && (
                          <div className="mt-1 text-sm text-white/60">{appointment.notes}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-white/50">
                      {appointment.duration_minutes} min
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Create Appointment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#242423] rounded-3xl border border-white/10 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Create Appointment</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-full hover:bg-white/10 transition"
              >
                <X className="h-5 w-5 text-white/70" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Description *
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="What is the meeting about?"
                  rows={3}
                  className="w-full px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Date *
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    min={dayjs().format("YYYY-MM-DD")}
                    className="w-full px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Time *
                  </label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  min="15"
                  step="15"
                  placeholder="60"
                  className="w-full px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className="flex-1 px-4 py-2 rounded-2xl bg-white/10 text-white hover:bg-white/15 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAppointment}
                  disabled={creating || !formName.trim() || !formPhone.trim() || !formDescription.trim()}
                  className="flex-1 px-4 py-2 rounded-2xl bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? "Creating..." : "Create & Send SMS"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
