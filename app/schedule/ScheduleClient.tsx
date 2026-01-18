// app/schedule/ScheduleClient.tsx
"use client";

import { useState, useEffect } from "react";
import dayjs from "dayjs";
import { Plus, X, Calendar, Clock, User, Phone, FileText, Mail } from "lucide-react";

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
    email?: string;
  };
}

interface ScheduleClientProps {
  initialAppointments: Appointment[];
  workspaceId: string;
  theme?: "dark" | "white";
}

type LocalAppointment = Appointment & { localTime: dayjs.Dayjs };

export default function ScheduleClient({ initialAppointments, workspaceId, theme = "dark" }: ScheduleClientProps) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [showDayView, setShowDayView] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);
  const [appointmentReminderTiming, setAppointmentReminderTiming] = useState<string[]>([]);
  const [appointmentReminderChannels, setAppointmentReminderChannels] = useState<{ sms: boolean; email: boolean }>({ sms: true, email: false });
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);
  
  // Theme helpers
  const isWhite = theme === "white";
  const containerBg = isWhite ? "bg-white" : "";
  const containerText = isWhite ? "text-black" : "text-white";
  const cardBg = isWhite ? "bg-white" : "bg-black/40 backdrop-blur-sm";
  const cardBorder = isWhite ? "border-2 border-black" : "border border-white/10";
  const inputBg = isWhite ? "bg-white border-2 border-black" : "bg-white/5 border border-white/10";
  const inputText = isWhite ? "text-black placeholder-gray-400" : "text-white placeholder-white/40";
  const buttonPrimary = isWhite ? "bg-black text-white hover:bg-gray-800" : "bg-[#f97316] text-white hover:bg-[#ea580c]";
  const buttonSecondary = isWhite ? "border-2 border-black text-black hover:bg-gray-50" : "border border-white/10 text-white/70 hover:bg-white/10";
  const selectedBg = isWhite ? "bg-black text-white" : "bg-white text-gray-900";
  const hoverBg = isWhite ? "hover:bg-gray-50" : "hover:bg-white/10";
  const divider = isWhite ? "border-black" : "border-white/10";
  const divider2 = isWhite ? "border-2 border-black" : "border border-white/10";
  const textPrimary = isWhite ? "text-black" : "text-white";
  const textSecondary = isWhite ? "text-gray-600" : "text-white/70";
  const textTertiary = isWhite ? "text-gray-500" : "text-white/50";
  const modalBg = isWhite ? "bg-white border-2 border-black" : "bg-[#242423] border border-white/10";
  const modalOverlay = isWhite ? "bg-black/50" : "bg-black/60";
  const statusConfirmed = isWhite ? "bg-green-50 text-green-700 border border-black" : "bg-green-400/20 text-green-200";
  const statusPending = isWhite ? "bg-yellow-50 text-yellow-700 border border-black" : "bg-yellow-400/20 text-yellow-200";
  const statusDefault = isWhite ? "bg-gray-50 text-gray-700 border border-black" : "bg-white/10 text-white/60";
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [formTime, setFormTime] = useState(dayjs().add(1, "hour").format("HH:mm"));
  const [formDuration, setFormDuration] = useState("60");
  const [formReminderTiming, setFormReminderTiming] = useState<string[]>([]);
  const [formReminderChannels, setFormReminderChannels] = useState<{ sms: boolean; email: boolean }>({ sms: true, email: false });

  // Fetch reminders when appointment is selected
  useEffect(() => {
    if (selectedAppointment) {
      setLoadingReminders(true);
      fetch(`/api/appointments/${selectedAppointment.id}/reminders`)
        .then((res) => res.json())
        .then((data) => {
          setAppointmentReminderTiming(data.reminderTiming || []);
        })
        .catch((err) => {
          console.error("Failed to fetch reminders:", err);
          setAppointmentReminderTiming([]);
        })
        .finally(() => {
          setLoadingReminders(false);
        });
    } else {
      setAppointmentReminderTiming([]);
    }
  }, [selectedAppointment]);

  // Save reminder timings
  const handleSaveReminders = async () => {
    if (!selectedAppointment) return;
    
    setSavingReminders(true);
    try {
      const response = await fetch(`/api/appointments/${selectedAppointment.id}/reminders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          reminderTiming: appointmentReminderTiming,
          reminderChannels: appointmentReminderChannels,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update reminders");
      }

      alert("Reminder timings updated successfully!");
    } catch (error: any) {
      console.error("Failed to save reminders:", error);
      alert(error.message || "Failed to update reminders");
    } finally {
      setSavingReminders(false);
    }
  };

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
          email: formEmail.trim() || undefined,
          description: formDescription.trim(),
          scheduledAt,
          durationMinutes: parseInt(formDuration) || 60,
          reminderTiming: formReminderTiming,
          reminderChannels: formReminderChannels,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create appointment");
      }

      const data = await response.json();
      
      // Show SMS status
      if (data.smsError) {
        alert(`Appointment created successfully, but SMS reminder failed: ${data.smsError}`);
      } else if (data.smsSent) {
        console.log("SMS reminder sent successfully");
      }
      
      // Reset form
      setFormName("");
      setFormPhone("");
      setFormEmail("");
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
    <div className={`h-full flex flex-col space-y-6 ${containerText} p-6 overflow-y-auto relative ${containerBg}`}>
      {/* Floating Create Button - Always visible */}
      {isWhite ? (
        <div className="fixed bottom-8 right-8 z-50">
          <div className="relative inline-block">
            <div className="absolute -inset-1 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 rounded-full blur-sm opacity-50"></div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="relative px-6 py-3 rounded-full bg-black text-white hover:bg-gray-800 text-sm font-semibold transition flex items-center gap-2 shadow-xl hover:scale-105"
            >
              <Plus className="h-6 w-6" />
              Create Appointment
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreateModal(true)}
          className={`fixed bottom-8 right-8 z-50 px-6 py-3 rounded-full ${buttonPrimary} text-sm font-semibold transition flex items-center gap-2 shadow-xl hover:scale-105`}
        >
          <Plus className="h-6 w-6" />
          Create Appointment
        </button>
      )}

      <div className="max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-semibold ${textPrimary}`}>Schedule</h2>
        </div>

        <div className={`rounded-2xl ${cardBorder} ${cardBg} p-6 shadow-lg`}>
      {/* View Toggle */}
      <div className="flex items-center gap-4">
        <div className={`flex rounded-2xl ${cardBorder} ${isWhite ? "bg-white" : "bg-white/5"} p-1`}>
          <button
            onClick={() => {
              setView("calendar");
              setShowDayView(false);
            }}
            className={`px-3 py-1 rounded-2xl text-sm font-medium transition-colors ${
              view === "calendar"
                ? `${selectedBg} shadow-md`
                : `${textPrimary} ${hoverBg}`
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
                ? `${selectedBg} shadow-md`
                : `${textPrimary} ${hoverBg}`
            }`}
          >
            List
          </button>
        </div>
        
        {showDayView && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDayView(false)}
              className={`px-3 py-1 text-sm rounded-2xl ${buttonSecondary}`}
            >
              ← Back to Calendar
            </button>
            <span className={`text-sm ${textSecondary}`}>
              {selectedDate.format("dddd, MMMM D, YYYY")}
            </span>
          </div>
        )}
      </div>

      {showDayView ? (
        /* Google Calendar-style Day View */
        <div className={`rounded-2xl ${cardBorder} ${cardBg} shadow-lg`}>
          <div className={`p-6 ${isWhite ? "border-b-2" : "border-b"} ${divider}`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-xl font-semibold ${textPrimary}`}>
                {selectedDate.format("dddd, MMMM D, YYYY")}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedDate(selectedDate.subtract(1, "day"))}
                  className={`p-2 rounded-2xl ${buttonSecondary}`}
                >
                  ←
                </button>
                <button
                  onClick={() => setSelectedDate(dayjs())}
                  className={`px-3 py-1 text-sm rounded-2xl ${buttonPrimary}`}
                >
                  Today
                </button>
                <button
                  onClick={() => setSelectedDate(selectedDate.add(1, "day"))}
                  className={`p-2 rounded-2xl ${buttonSecondary}`}
                >
                  →
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            {/* Time labels */}
            <div className={`absolute left-0 top-0 w-16 h-full ${isWhite ? "border-r-2" : "border-r"} ${divider}`}>
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className={`h-12 ${isWhite ? "border-b border-gray-200" : "border-b border-white/5"} flex items-start justify-end pr-2`}>
                  <span className={`mt-1 text-xs ${textSecondary}`}>
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
                  <div key={hour} className={`relative h-12 ${isWhite ? "border-b border-gray-200" : "border-b border-white/5"}`}>
                    {hourAppointments.map((appointment) => {
                      const minutes = appointment.localTime.minute();
                      const topOffset = (minutes / 60) * 48; // 48px = height of hour slot
                      const duration = appointment.duration_minutes || 60;
                      const height = Math.max(36, (duration / 60) * 48);
                      
                      return (
                        <div
                          key={appointment.id}
                          onClick={() => setSelectedAppointment(appointment)}
                          className={`absolute left-0 right-0 rounded-2xl ${isWhite ? "border-2 border-black bg-white" : "border border-[#f97316]/40 bg-[#f97316]/20"} p-2 shadow-md transition hover:shadow-lg cursor-pointer`}
                          style={{ top: `${topOffset}px`, height: `${height}px` }}
                        >
                          <div className="flex items-center justify-between h-full">
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-medium ${isWhite ? "text-black" : "text-white"} truncate`}>
                                {appointment.contacts.name}
                              </div>
                              <div className={`text-xs ${isWhite ? "text-gray-600" : "text-white/70"} truncate`}>
                                {appointment.service_type}
                              </div>
                            </div>
                            <div className="ml-2 flex-shrink-0">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                appointment.status === "confirmed" 
                                  ? statusConfirmed
                                  : appointment.status === "pending"
                                  ? statusPending
                                  : statusDefault
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
            <div className={`rounded-2xl ${cardBorder} ${cardBg} p-6 shadow-lg flex-1 flex flex-col min-h-0`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className={`text-lg font-semibold ${textPrimary}`}>
                  {selectedDate.format("MMMM YYYY")}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedDate(selectedDate.subtract(1, "month"))}
                    className={`rounded-2xl ${buttonSecondary} p-2`}
                  >
                    ←
                  </button>
                  <button
                    onClick={() => setSelectedDate(dayjs())}
                    className={`rounded-2xl ${buttonPrimary} px-3 py-1 text-sm`}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setSelectedDate(selectedDate.add(1, "month"))}
                    className={`rounded-2xl ${buttonSecondary} p-2`}
                  >
                    →
                  </button>
                </div>
              </div>

              {/* Month Calendar Grid */}
              <div className="mb-3 grid grid-cols-7 gap-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className={`p-2 text-center text-sm font-semibold ${isWhite ? "text-black" : "text-white/60"}`}>
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
                      className={`rounded-2xl p-4 text-sm transition min-h-[80px] flex flex-col items-center justify-start ${isWhite ? "border-2" : "border"} ${divider} ${
                        isToday ? (isWhite ? "bg-gray-50" : "bg-[#f97316]/25 text-[#fb923c]") : ""
                      } ${isSelected ? (isWhite ? "bg-black text-white" : "border-2 border-[#f97316] bg-[#f97316]/30 text-white") : `${hoverBg} ${isWhite ? "bg-white" : "border-white/5"}`}`}
                      >
                        <div className="text-center font-medium text-base mb-1">{day}</div>
                        {dayAppointments.length > 0 && (
                          <div className={`mt-auto text-xs font-semibold ${isSelected ? (isWhite ? "text-white" : "text-white") : (isWhite ? "text-black" : "text-[#fb923c]")}`}>
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
            <div className={`rounded-2xl ${cardBorder} ${cardBg} p-6 shadow-lg`}>
              <h3 className={`mb-4 text-lg font-semibold ${textPrimary}`}>
                {selectedDate.format("dddd, MMMM D")}
              </h3>
              
              {todayAppointments.length === 0 ? (
                <p className={`text-sm ${textTertiary}`}>No appointments scheduled</p>
              ) : (
                <div className="space-y-3">
                  {todayAppointments.map((appointment) => (
                      <div 
                        key={appointment.id} 
                        onClick={() => setSelectedAppointment(appointment)}
                        className={`rounded-2xl ${cardBorder} ${isWhite ? "bg-white" : "bg-white/5"} p-3 cursor-pointer ${hoverBg} transition`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className={`text-sm font-medium ${textPrimary}`}>
                            {appointment.localTime.format("h:mm A")}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            appointment.status === "confirmed" 
                              ? statusConfirmed
                              : appointment.status === "pending"
                              ? statusPending
                              : statusDefault
                          }`}>
                            {appointment.status}
                          </span>
                        </div>
                        <div className={`text-sm ${textSecondary}`}>
                          <div className={`font-medium ${textPrimary}`}>{appointment.contacts.name}</div>
                          <div>{appointment.contacts.phone}</div>
                          <div className={textTertiary}>{appointment.service_type}</div>
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
        <div className={`rounded-2xl ${cardBorder} ${cardBg} shadow-lg`}>
          <div className={`${isWhite ? "border-b-2" : "border-b"} ${divider} p-6`}>
            <h2 className={`text-lg font-semibold ${textPrimary}`}>All Appointments</h2>
          </div>
          
          <div className={`${isWhite ? "divide-y-2 divide-black" : "divide-y divide-white/10"}`}>
            {appointments.length === 0 ? (
              <div className={`p-6 text-center ${textTertiary}`}>
                No appointments scheduled
              </div>
            ) : (
              normalizedAppointments.map((appointment) => (
                <div 
                  key={appointment.id} 
                  onClick={() => setSelectedAppointment(appointment)}
                  className={`p-6 transition ${hoverBg} cursor-pointer`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4">
                        <div className={`text-sm font-medium ${textPrimary}`}>
                          {appointment.localTime.format("MMM D, YYYY h:mm A")}
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          appointment.status === "confirmed" 
                            ? statusConfirmed
                            : appointment.status === "pending"
                            ? statusPending
                            : statusDefault
                        }`}>
                          {appointment.status}
                        </span>
                      </div>
                      <div className="mt-2">
                        <div className={`font-medium ${textPrimary}`}>{appointment.contacts.name}</div>
                        <div className={`text-sm ${textSecondary}`}>{appointment.contacts.phone}</div>
                        <div className={`text-sm ${textTertiary}`}>{appointment.service_type}</div>
                        {appointment.notes && (
                          <div className={`mt-1 text-sm ${textTertiary}`}>{appointment.notes}</div>
                        )}
                      </div>
                    </div>
                    <div className={`text-sm ${textTertiary}`}>
                      {appointment.duration_minutes} min
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
        </div>
      </div>

      {/* Create Appointment Modal */}
      {showCreateModal && (
        <div className={`fixed inset-0 ${modalOverlay} backdrop-blur-sm z-50 flex items-center justify-center p-4`}>
          <div className={`${modalBg} rounded-3xl ${isWhite ? "border-2" : "border"} ${isWhite ? "border-black" : "border-white/10"} p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-semibold ${textPrimary}`}>Create Appointment</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className={`p-2 rounded-full ${buttonSecondary}`}
              >
                <X className={`h-5 w-5 ${textPrimary}`} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className={`block text-sm font-medium ${textPrimary} mb-2 flex items-center gap-2`}>
                  <User className="h-4 w-4" />
                  Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="John Doe"
                  className={`w-full px-4 py-2 rounded-2xl ${inputBg} ${inputText} focus:outline-none focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                />
              </div>

              {/* Phone */}
              <div>
                <label className={`block text-sm font-medium ${textPrimary} mb-2 flex items-center gap-2`}>
                  <Phone className="h-4 w-4" />
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="+1234567890"
                  className={`w-full px-4 py-2 rounded-2xl ${inputBg} ${inputText} focus:outline-none focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                />
              </div>

              {/* Email */}
              <div>
                <label className={`block text-sm font-medium ${textPrimary} mb-2 flex items-center gap-2`}>
                  <Mail className="h-4 w-4" />
                  Email
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="john@example.com"
                  className={`w-full px-4 py-2 rounded-2xl ${inputBg} ${inputText} focus:outline-none focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                />
              </div>

              {/* Description */}
              <div>
                <label className={`block text-sm font-medium ${textPrimary} mb-2 flex items-center gap-2`}>
                  <FileText className="h-4 w-4" />
                  Description *
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="What is the meeting about?"
                  rows={3}
                  className={`w-full px-4 py-2 rounded-2xl ${inputBg} ${inputText} focus:outline-none focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"} resize-none`}
                />
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium ${textPrimary} mb-2 flex items-center gap-2`}>
                    <Calendar className="h-4 w-4" />
                    Date *
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    min={dayjs().format("YYYY-MM-DD")}
                    className={`w-full px-4 py-2 rounded-2xl ${inputBg} ${inputText} focus:outline-none focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${textPrimary} mb-2 flex items-center gap-2`}>
                    <Clock className="h-4 w-4" />
                    Time *
                  </label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className={`w-full px-4 py-2 rounded-2xl ${inputBg} ${inputText} focus:outline-none focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                  />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className={`block text-sm font-medium ${textPrimary} mb-2`}>
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  min="15"
                  step="15"
                  placeholder="60"
                  className={`w-full px-4 py-2 rounded-2xl ${inputBg} ${inputText} focus:outline-none focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                />
              </div>

              {/* Reminder Channels */}
              <div>
                <label className={`block text-sm font-medium ${textPrimary} mb-2`}>
                  Reminder Channels
                </label>
                <div className="space-y-2 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formReminderChannels.sms}
                      onChange={(e) => setFormReminderChannels({ ...formReminderChannels, sms: e.target.checked })}
                      className={`rounded ${isWhite ? "border-2 border-black" : "border border-white/20 bg-white/5"} ${isWhite ? "text-black" : "text-blue-500"} focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                    />
                    <span className={`text-sm ${textPrimary}`}>SMS</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formReminderChannels.email}
                      onChange={(e) => setFormReminderChannels({ ...formReminderChannels, email: e.target.checked })}
                      className={`rounded ${isWhite ? "border-2 border-black" : "border border-white/20 bg-white/5"} ${isWhite ? "text-black" : "text-blue-500"} focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                    />
                    <span className={`text-sm ${textPrimary}`}>Email</span>
                  </label>
                </div>
              </div>

              {/* Reminder Timing */}
              <div>
                <label className={`block text-sm font-medium ${textPrimary} mb-2`}>
                  Send Reminders
                </label>
                <div className="space-y-2">
                  {[
                    { value: "immediate", label: "Immediately" },
                    { value: "1_day", label: "1 Day Before" },
                    { value: "5_hours", label: "5 Hours Before" },
                    { value: "1_hour", label: "1 Hour Before" },
                  ].map((option) => (
                    <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formReminderTiming.includes(option.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormReminderTiming([...formReminderTiming, option.value]);
                          } else {
                            setFormReminderTiming(formReminderTiming.filter(t => t !== option.value));
                          }
                        }}
                        className={`rounded ${isWhite ? "border-2 border-black" : "border border-white/20 bg-white/5"} ${isWhite ? "text-black" : "text-blue-500"} focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                      />
                      <span className={`text-sm ${textPrimary}`}>{option.label}</span>
                    </label>
                  ))}
                </div>
                <p className={`text-xs ${textTertiary} mt-2`}>
                  Select when to send reminders. If none selected, an immediate reminder will be sent.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className={`flex-1 px-4 py-2 rounded-2xl ${buttonSecondary} transition disabled:opacity-50`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAppointment}
                  disabled={creating || !formName.trim() || !formPhone.trim() || !formDescription.trim()}
                  className={`flex-1 px-4 py-2 rounded-2xl ${buttonPrimary} transition disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {creating ? "Creating..." : "Create & Send Reminders"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Appointment Details Modal */}
      {selectedAppointment && (
        <div className={`fixed inset-0 ${modalOverlay} backdrop-blur-sm z-50 flex items-center justify-center p-4`}>
          <div className={`${modalBg} rounded-3xl ${isWhite ? "border-2" : "border"} ${isWhite ? "border-black" : "border-white/10"} p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-semibold ${textPrimary}`}>Appointment Details</h3>
              <button
                onClick={() => setSelectedAppointment(null)}
                className={`p-2 rounded-full ${buttonSecondary}`}
              >
                <X className={`h-5 w-5 ${textPrimary}`} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Contact Info */}
              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-medium ${textSecondary} mb-1`}>Name</label>
                  <div className={`flex items-center gap-2 ${textPrimary}`}>
                    <User className={`h-4 w-4 ${textSecondary}`} />
                    <span>{selectedAppointment.contacts.name}</span>
                  </div>
                </div>
                <div>
                  <label className={`block text-xs font-medium ${textSecondary} mb-1`}>Phone</label>
                  <div className={`flex items-center gap-2 ${textPrimary}`}>
                    <Phone className={`h-4 w-4 ${textSecondary}`} />
                    <span>{selectedAppointment.contacts.phone}</span>
                  </div>
                </div>
                {selectedAppointment.contacts.email && (
                  <div>
                    <label className={`block text-xs font-medium ${textSecondary} mb-1`}>Email</label>
                    <div className={`flex items-center gap-2 ${textPrimary}`}>
                      <Mail className={`h-4 w-4 ${textSecondary}`} />
                      <span>{selectedAppointment.contacts.email}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Appointment Info */}
              <div className={`${isWhite ? "border-t-2" : "border-t"} ${divider} pt-4 space-y-3`}>
                <div>
                  <label className={`block text-xs font-medium ${textSecondary} mb-1`}>Date & Time</label>
                  <div className={`flex items-center gap-2 ${textPrimary}`}>
                    <Calendar className={`h-4 w-4 ${textSecondary}`} />
                    <span>{dayjs(selectedAppointment.scheduled_at).format("dddd, MMMM D, YYYY")}</span>
                  </div>
                  <div className={`flex items-center gap-2 ${textSecondary} ml-6`}>
                    <Clock className={`h-4 w-4 ${textSecondary}`} />
                    <span>{dayjs(selectedAppointment.scheduled_at).format("h:mm A")}</span>
                  </div>
                </div>
                <div>
                  <label className={`block text-xs font-medium ${textSecondary} mb-1`}>Duration</label>
                  <div className={textPrimary}>{selectedAppointment.duration_minutes} minutes</div>
                </div>
                <div>
                  <label className={`block text-xs font-medium ${textSecondary} mb-1`}>Service Type</label>
                  <div className={`flex items-center gap-2 ${textPrimary}`}>
                    <FileText className={`h-4 w-4 ${textSecondary}`} />
                    <span>{selectedAppointment.service_type}</span>
                  </div>
                </div>
                <div>
                  <label className={`block text-xs font-medium ${textSecondary} mb-1`}>Status</label>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    selectedAppointment.status === "confirmed" 
                      ? statusConfirmed
                      : selectedAppointment.status === "pending"
                      ? statusPending
                      : statusDefault
                  }`}>
                    {selectedAppointment.status}
                  </span>
                </div>
                {selectedAppointment.notes && (
                  <div>
                    <label className={`block text-xs font-medium ${textSecondary} mb-1`}>Notes</label>
                    <div className={`${textSecondary} text-sm`}>{selectedAppointment.notes}</div>
                  </div>
                )}
              </div>

              {/* Reminder Channels */}
              <div className={`${isWhite ? "border-t-2" : "border-t"} ${divider} pt-4 space-y-3`}>
                <div>
                  <label className={`block text-sm font-medium ${textPrimary} mb-2`}>
                    Reminder Channels
                  </label>
                  <div className="space-y-2 mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={appointmentReminderChannels.sms}
                        onChange={(e) => setAppointmentReminderChannels({ ...appointmentReminderChannels, sms: e.target.checked })}
                        className={`rounded ${isWhite ? "border-2 border-black" : "border border-white/20 bg-white/5"} ${isWhite ? "text-black" : "text-blue-500"} focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                      />
                      <span className={`text-sm ${textPrimary}`}>SMS</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={appointmentReminderChannels.email}
                        onChange={(e) => setAppointmentReminderChannels({ ...appointmentReminderChannels, email: e.target.checked })}
                        disabled={!selectedAppointment.contacts.email}
                        className={`rounded ${isWhite ? "border-2 border-black" : "border border-white/20 bg-white/5"} ${isWhite ? "text-black" : "text-blue-500"} focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"} disabled:opacity-50`}
                      />
                      <span className={`text-sm ${textPrimary} ${!selectedAppointment.contacts.email ? "opacity-50" : ""}`}>
                        Email {!selectedAppointment.contacts.email && "(No email provided)"}
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Reminder Timings */}
              <div className={`${isWhite ? "border-t-2" : "border-t"} ${divider} pt-4 space-y-3`}>
                <div>
                  <label className={`block text-sm font-medium ${textPrimary} mb-2`}>
                    Reminder Timings
                  </label>
                  {loadingReminders ? (
                    <div className={`text-sm ${textTertiary}`}>Loading reminders...</div>
                  ) : (
                    <div className="space-y-2">
                      {[
                        { value: "immediate", label: "Immediately" },
                        { value: "1_day", label: "1 Day Before" },
                        { value: "5_hours", label: "5 Hours Before" },
                        { value: "1_hour", label: "1 Hour Before" },
                      ].map((option) => (
                        <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={appointmentReminderTiming.includes(option.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAppointmentReminderTiming([...appointmentReminderTiming, option.value]);
                              } else {
                                setAppointmentReminderTiming(appointmentReminderTiming.filter(t => t !== option.value));
                              }
                            }}
                            className={`rounded ${isWhite ? "border-2 border-black" : "border border-white/20 bg-white/5"} ${isWhite ? "text-black" : "text-blue-500"} focus:ring-2 ${isWhite ? "focus:ring-black/20" : "focus:ring-blue-500"}`}
                          />
                          <span className={`text-sm ${textPrimary}`}>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className={`text-xs ${textTertiary} mt-2`}>
                    Select when to send reminders. Changes will update scheduled reminders.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className={`pt-4 ${isWhite ? "border-t-2" : "border-t"} ${divider} flex gap-3`}>
                <button
                  onClick={() => setSelectedAppointment(null)}
                  className={`flex-1 px-4 py-2 rounded-2xl ${buttonSecondary} transition`}
                >
                  Close
                </button>
                <button
                  onClick={handleSaveReminders}
                  disabled={savingReminders || loadingReminders}
                  className={`flex-1 px-4 py-2 rounded-2xl ${buttonPrimary} transition disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {savingReminders ? "Saving..." : "Save Reminders"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
