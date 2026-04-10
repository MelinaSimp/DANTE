// app/schedule/ScheduleClient.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import dayjs from "dayjs";
import { Plus, X, Calendar, Clock, User, Phone, FileText, Mail, Pencil, Check, Loader2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Mic, MessageSquare, Sparkles } from "lucide-react";

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

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 12am – 11pm (full day)
const HOUR_HEIGHT = 60; // px per hour

const CLIENT_COLORS = [
  { bg: "bg-blue-100", border: "border-blue-400", text: "text-blue-900", dot: "bg-blue-500", check: "text-blue-500 border-blue-500 bg-blue-50" },
  { bg: "bg-green-100", border: "border-green-400", text: "text-green-900", dot: "bg-green-500", check: "text-green-500 border-green-500 bg-green-50" },
  { bg: "bg-purple-100", border: "border-purple-400", text: "text-purple-900", dot: "bg-purple-500", check: "text-purple-500 border-purple-500 bg-purple-50" },
  { bg: "bg-amber-100", border: "border-amber-400", text: "text-amber-900", dot: "bg-amber-500", check: "text-amber-500 border-amber-500 bg-amber-50" },
  { bg: "bg-rose-100", border: "border-rose-400", text: "text-rose-900", dot: "bg-rose-500", check: "text-rose-500 border-rose-500 bg-rose-50" },
  { bg: "bg-cyan-100", border: "border-cyan-400", text: "text-cyan-900", dot: "bg-cyan-500", check: "text-cyan-500 border-cyan-500 bg-cyan-50" },
  { bg: "bg-indigo-100", border: "border-indigo-400", text: "text-indigo-900", dot: "bg-indigo-500", check: "text-indigo-500 border-indigo-500 bg-indigo-50" },
  { bg: "bg-teal-100", border: "border-teal-400", text: "text-teal-900", dot: "bg-teal-500", check: "text-teal-500 border-teal-500 bg-teal-50" },
];

const SLOT_TYPE_COLORS = [
  { bg: "bg-green-50", border: "border-green-400", text: "text-green-700", dot: "bg-green-500" },
  { bg: "bg-blue-50", border: "border-blue-400", text: "text-blue-700", dot: "bg-blue-500" },
  { bg: "bg-purple-50", border: "border-purple-400", text: "text-purple-700", dot: "bg-purple-500" },
  { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-700", dot: "bg-amber-500" },
  { bg: "bg-rose-50", border: "border-rose-400", text: "text-rose-700", dot: "bg-rose-500" },
  { bg: "bg-cyan-50", border: "border-cyan-400", text: "text-cyan-700", dot: "bg-cyan-500" },
  { bg: "bg-indigo-50", border: "border-indigo-400", text: "text-indigo-700", dot: "bg-indigo-500" },
  { bg: "bg-teal-50", border: "border-teal-400", text: "text-teal-700", dot: "bg-teal-500" },
  { bg: "bg-orange-50", border: "border-orange-400", text: "text-orange-700", dot: "bg-orange-500" },
  { bg: "bg-lime-50", border: "border-lime-400", text: "text-lime-700", dot: "bg-lime-500" },
];

function getSlotTypeColor(slotType: string, allTypes: string[]) {
  const idx = allTypes.indexOf(slotType);
  return SLOT_TYPE_COLORS[(idx >= 0 ? idx : 0) % SLOT_TYPE_COLORS.length];
}

function getClientColorIndex(clientId: string, clients: { id: string }[]): number {
  const idx = clients.findIndex((c) => c.id === clientId);
  return (idx >= 0 ? idx : 0) % CLIENT_COLORS.length;
}

function eventColorClass(clientId: string, clients: { id: string }[]): string {
  const c = CLIENT_COLORS[getClientColorIndex(clientId, clients)];
  return `${c.bg} ${c.border} ${c.text}`;
}

export default function ScheduleClient({ initialAppointments, workspaceId, theme = "dark" }: ScheduleClientProps) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(dayjs().startOf("week"));
  const [monthDate, setMonthDate] = useState(dayjs());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);
  const [appointmentReminderTiming, setAppointmentReminderTiming] = useState<string[]>([]);
  const [appointmentReminderChannels, setAppointmentReminderChannels] = useState<{ sms: boolean; email: boolean }>({ sms: true, email: false });
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(false);
  const [editFields, setEditFields] = useState({ service_type: "", notes: "", scheduled_at: "", duration_minutes: 30 });
  const [savingAppointment, setSavingAppointment] = useState(false);

  // Call record & AI overview for selected appointment
  const [callRecord, setCallRecord] = useState<{ recording_url?: string; transcript?: any; summary?: string } | null>(null);
  const [loadingCallRecord, setLoadingCallRecord] = useState(false);
  const [aiOverview, setAiOverview] = useState<string | null>(null);
  const [loadingAiOverview, setLoadingAiOverview] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Slot type management
  const DEFAULT_SLOT_TYPES = ["General", "Appointments", "Estate Planning", "Tax Consultation", "Portfolio Review"];
  const [slotTypes, setSlotTypes] = useState<string[]>(DEFAULT_SLOT_TYPES);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  // Availability slots
  interface AvailabilitySlot { id: string; slot_date: string; start_time: string; end_time: string; notes?: string; slot_type?: string; }
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [slotDate, setSlotDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [slotStartTime, setSlotStartTime] = useState("09:00");
  const [slotEndTime, setSlotEndTime] = useState("12:00");
  const [slotType, setSlotType] = useState("General");
  const [creatingSlot, setCreatingSlot] = useState(false);

  // Load slot types from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("drift-slot-types");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setSlotTypes(parsed);
      }
    } catch {}
  }, []);

  const persistSlotTypes = (types: string[]) => {
    setSlotTypes(types);
    localStorage.setItem("drift-slot-types", JSON.stringify(types));
  };

  const addSlotType = () => {
    const trimmed = newTypeName.trim();
    if (!trimmed || slotTypes.includes(trimmed)) return;
    persistSlotTypes([...slotTypes, trimmed]);
    setNewTypeName("");
  };

  const removeSlotType = (type: string) => {
    if (type === "General") return;
    persistSlotTypes(slotTypes.filter((t) => t !== type));
  };

  // Fetch availability slots
  useEffect(() => {
    fetch("/api/availability-slots", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setAvailabilitySlots(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const createAvailabilitySlot = async () => {
    if (!slotDate || !slotStartTime || !slotEndTime) return;
    setCreatingSlot(true);
    try {
      const res = await fetch("/api/availability-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slot_date: slotDate, start_time: slotStartTime, end_time: slotEndTime, slot_type: slotType }),
      });
      if (res.ok) {
        const slot = await res.json();
        setAvailabilitySlots((prev) => [...prev, slot]);
        setShowSlotModal(false);
        setSlotDate(dayjs().format("YYYY-MM-DD"));
        setSlotStartTime("09:00");
        setSlotEndTime("12:00");
        setSlotType("General");
      }
    } catch (err) {
      console.error("Failed to create slot:", err);
    } finally {
      setCreatingSlot(false);
    }
  };

  const deleteAvailabilitySlot = async (slotId: string) => {
    try {
      await fetch(`/api/availability-slots?id=${slotId}`, { method: "DELETE", credentials: "include" });
      setAvailabilitySlots((prev) => prev.filter((s) => s.id !== slotId));
    } catch (err) {
      console.error("Failed to delete slot:", err);
    }
  };

  const getSlotsForDay = (day: dayjs.Dayjs) =>
    availabilitySlots.filter((s) => s.slot_date === day.format("YYYY-MM-DD"));

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

  // Client filter state
  const [hiddenClients, setHiddenClients] = useState<Set<string>>(new Set());
  const [clientsExpanded, setClientsExpanded] = useState(true);
  const [allContacts, setAllContacts] = useState<{ id: string; name: string; phone?: string; email?: string }[]>([]);
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [addingClient, setAddingClient] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);

  // Fetch all contacts for the client list
  useEffect(() => {
    fetch("/api/contacts", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setAllContacts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);


  const handleAddClient = async () => {
    if (!newClientName.trim() || !newClientPhone.trim()) return;
    setAddingClient(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newClientName.trim(), phone: newClientPhone.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setAllContacts((prev) => [...prev, { id: data.id, name: data.name, phone: data.phone, email: data.email }]);
        setNewClientName("");
        setNewClientPhone("");
        setShowAddClient(false);
      }
    } catch (err) {
      console.error("Failed to add client:", err);
    } finally {
      setAddingClient(false);
    }
  };

  // Scroll to 8am on mount
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = HOUR_HEIGHT * 8; // scroll to 8am
    }
  }, [viewMode]);

  // Normalize appointments
  const allNormalized: LocalAppointment[] = appointments.map((a) => {
    let parsed = dayjs(a.scheduled_at);
    if (!parsed.isValid()) parsed = dayjs(`${a.scheduled_at}Z`);
    if (!parsed.isValid()) parsed = dayjs(Number(a.scheduled_at));
    return { ...a, localTime: parsed };
  });

  // Unique clients for the filter sidebar
  const uniqueClients = Array.from(
    new Map(allNormalized.map((a) => [a.contacts.id, a.contacts])).values()
  );

  const toggleClient = (clientId: string) => {
    setHiddenClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  // Filtered appointments (exclude hidden clients)
  const normalizedAppointments = allNormalized.filter((a) => !hiddenClients.has(a.contacts.id));

  // Fetch reminders and call record when appointment is selected
  useEffect(() => {
    if (selectedAppointment) {
      setLoadingReminders(true);
      setCallRecord(null);
      setAiOverview(null);
      setShowTranscript(false);

      fetch(`/api/appointments/${selectedAppointment.id}/reminders`)
        .then((r) => r.json())
        .then((data) => setAppointmentReminderTiming(data.reminderTiming || []))
        .catch(() => setAppointmentReminderTiming([]))
        .finally(() => setLoadingReminders(false));

      if (selectedAppointment.contacts?.phone) {
        setLoadingCallRecord(true);
        fetch(`/api/appointments/${selectedAppointment.id}/call-record`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => { if (data) setCallRecord(data); })
          .catch(() => {})
          .finally(() => setLoadingCallRecord(false));
      }
    } else {
      setAppointmentReminderTiming([]);
      setCallRecord(null);
      setAiOverview(null);
    }
  }, [selectedAppointment]);

  const generateAiOverview = async () => {
    if (!callRecord?.transcript || !selectedAppointment) return;
    setLoadingAiOverview(true);
    try {
      const r = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: `Provide a brief professional summary of this call between the AI agent and ${selectedAppointment.contacts.name}. Include key topics discussed, decisions made, and any follow-up items.\n\nTranscript:\n${JSON.stringify(callRecord.transcript)}`,
          history: [],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        setAiOverview(d.message || d.content || "");
      }
    } catch {} finally { setLoadingAiOverview(false); }
  };

  const startEditingAppointment = () => {
    if (!selectedAppointment) return;
    setEditFields({
      service_type: selectedAppointment.service_type || "",
      notes: selectedAppointment.notes || "",
      scheduled_at: dayjs(selectedAppointment.scheduled_at).format("YYYY-MM-DDTHH:mm"),
      duration_minutes: selectedAppointment.duration_minutes || 30,
    });
    setEditingAppointment(true);
  };

  const handleSaveAppointment = async () => {
    if (!selectedAppointment) return;
    setSavingAppointment(true);
    try {
      const response = await fetch(`/api/appointments/${selectedAppointment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          service_type: editFields.service_type,
          notes: editFields.notes,
          scheduled_at: new Date(editFields.scheduled_at).toISOString(),
          duration_minutes: editFields.duration_minutes,
        }),
      });
      if (response.ok) {
        const updated = await response.json();
        const updatedAppointment = { ...selectedAppointment, service_type: updated.service_type, notes: updated.notes, scheduled_at: updated.scheduled_at, duration_minutes: updated.duration_minutes };
        setSelectedAppointment(updatedAppointment);
        setAppointments((prev) => prev.map((a) => (a.id === selectedAppointment.id ? updatedAppointment : a)));
        setEditingAppointment(false);
      }
    } catch (err) {
      console.error("Failed to save appointment:", err);
    } finally {
      setSavingAppointment(false);
    }
  };

  const handleSaveReminders = async () => {
    if (!selectedAppointment) return;
    setSavingReminders(true);
    try {
      const response = await fetch(`/api/appointments/${selectedAppointment.id}/reminders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderTiming: appointmentReminderTiming, reminderChannels: appointmentReminderChannels }),
      });
      if (!response.ok) throw new Error("Failed to update reminders");
      showToast("Reminder timings updated!");
    } catch (error: any) {
      showToast(error.message || "Failed to update reminders", "error");
    } finally {
      setSavingReminders(false);
    }
  };

  const handleCreateAppointment = async () => {
    if (!formName.trim() || !formPhone.trim() || !formDescription.trim()) {
      showToast("Please fill in all required fields", "error");
      return;
    }
    setCreating(true);
    try {
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
      setFormName(""); setFormPhone(""); setFormEmail(""); setFormDescription("");
      setFormDate(dayjs().format("YYYY-MM-DD")); setFormTime(dayjs().add(1, "hour").format("HH:mm"));
      setFormDuration("60"); setFormReminderTiming([]); setFormReminderChannels({ sms: true, email: false });
      setShowCreateModal(false);
      window.location.reload();
    } catch (error: any) {
      showToast(error.message || "Failed to create appointment", "error");
    } finally {
      setCreating(false);
    }
  };

  // Navigation
  const goToday = () => { setWeekStart(dayjs().startOf("week")); setMonthDate(dayjs()); };
  const goPrev = () => viewMode === "week" ? setWeekStart(weekStart.subtract(1, "week")) : setMonthDate(monthDate.subtract(1, "month"));
  const goNext = () => viewMode === "week" ? setWeekStart(weekStart.add(1, "week")) : setMonthDate(monthDate.add(1, "month"));

  // Week days
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day"));
  const today = dayjs().startOf("day");

  // Header label
  const headerLabel = viewMode === "week"
    ? weekStart.month() === weekStart.add(6, "day").month()
      ? weekStart.format("MMMM YYYY")
      : `${weekStart.format("MMM")} – ${weekStart.add(6, "day").format("MMM YYYY")}`
    : monthDate.format("MMMM YYYY");

  // Get appointments for a specific day
  const getAppointmentsForDay = (day: dayjs.Dayjs) =>
    normalizedAppointments.filter((a) => a.localTime.startOf("day").isSame(day.startOf("day")));

  // Mini calendar
  const miniCalStart = monthDate.startOf("month").startOf("week");
  const miniCalDays = Array.from({ length: 42 }, (_, i) => miniCalStart.add(i, "day"));

  // Month view
  const monthStart = monthDate.startOf("month").startOf("week");
  const monthWeeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => monthStart.add(w * 7 + d, "day"))
  );

  return (
    <div className="flex flex-col h-full bg-white text-gray-900 rounded-2xl overflow-hidden border border-gray-200 relative">
      {/* Toast */}
      {toast && (
        <div className={`absolute top-3 right-3 z-50 max-w-xs rounded-xl shadow-lg border px-4 py-3 flex items-center gap-2 text-sm font-medium animate-in slide-in-from-top ${
          toast.type === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"
        }`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            Today
          </button>
          <button onClick={goPrev} className="p-1.5 rounded-full hover:bg-gray-100 transition">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={goNext} className="p-1.5 rounded-full hover:bg-gray-100 transition">
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 ml-1">{headerLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button onClick={() => setViewMode("week")} className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === "week" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              Week
            </button>
            <button onClick={() => setViewMode("month")} className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === "month" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              Month
            </button>
          </div>
          <button onClick={() => setShowSlotModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-300 text-green-700 bg-green-50 text-sm font-medium hover:bg-green-100 transition shadow-sm">
            <Plus className="h-4 w-4" />
            Open Slot
          </button>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 transition shadow-sm">
            <Plus className="h-4 w-4" />
            Create
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        {/* Mini Calendar Sidebar (week view only) */}
        {viewMode === "week" && (
          <div className="w-52 border-r border-gray-200 p-3 shrink-0 hidden lg:block">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">{monthDate.format("MMMM YYYY")}</span>
              <div className="flex gap-0.5">
                <button onClick={() => setMonthDate(monthDate.subtract(1, "month"))} className="p-0.5 rounded hover:bg-gray-100"><ChevronLeft className="h-3 w-3" /></button>
                <button onClick={() => setMonthDate(monthDate.add(1, "month"))} className="p-0.5 rounded hover:bg-gray-100"><ChevronRight className="h-3 w-3" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-0 text-center">
              {["S","M","T","W","T","F","S"].map((d, i) => (
                <div key={i} className="text-[10px] font-medium text-gray-400 py-1">{d}</div>
              ))}
              {miniCalDays.map((day, i) => {
                const isToday = day.isSame(today, "day");
                const isCurrentMonth = day.month() === monthDate.month();
                const hasAppt = getAppointmentsForDay(day).length > 0;
                return (
                  <button
                    key={i}
                    onClick={() => { setWeekStart(day.startOf("week")); }}
                    className={`text-[11px] py-1 rounded-full transition ${
                      isToday ? "bg-black text-white font-bold" :
                      !isCurrentMonth ? "text-gray-300" :
                      "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {day.date()}
                    {hasAppt && !isToday && <span className="block w-1 h-1 bg-blue-500 rounded-full mx-auto -mt-0.5" />}
                  </button>
                );
              })}
            </div>

            {/* My Clients — filter */}
            <div className="mt-5 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setClientsExpanded(!clientsExpanded)}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-gray-900"
                >
                  <span>My Clients</span>
                  {clientsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => setShowAddClient(!showAddClient)}
                  className="p-0.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                  title="Add client"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Add client form */}
              {showAddClient && (
                <div className="mb-2 p-2 rounded-lg border border-gray-200 bg-gray-50 space-y-1.5">
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Name"
                    className="w-full rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                  <input
                    type="tel"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    placeholder="Phone (+1...)"
                    className="w-full rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={handleAddClient}
                      disabled={addingClient || !newClientName.trim() || !newClientPhone.trim()}
                      className="flex-1 py-1 rounded-lg bg-cyan-600 text-white text-[10px] font-medium hover:bg-cyan-700 disabled:opacity-50 transition"
                    >
                      {addingClient ? "Adding..." : "Add"}
                    </button>
                    <button
                      onClick={() => { setShowAddClient(false); setNewClientName(""); setNewClientPhone(""); }}
                      className="px-2 py-1 rounded-lg border border-gray-300 text-[10px] text-gray-600 hover:bg-gray-100 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {clientsExpanded && (
                <div className="space-y-1">
                  {/* Merge contacts from appointments + allContacts */}
                  {(() => {
                    const merged = new Map<string, { id: string; name: string }>();
                    uniqueClients.forEach((c) => merged.set(c.id, c));
                    allContacts.forEach((c) => { if (!merged.has(c.id)) merged.set(c.id, c); });
                    const clientList = Array.from(merged.values());
                    return clientList.map((client) => {
                      const colorIdx = getClientColorIndex(client.id, clientList);
                      const color = CLIENT_COLORS[colorIdx];
                      const isVisible = !hiddenClients.has(client.id);
                      const apptCount = allNormalized.filter((a) => a.contacts.id === client.id).length;
                      return (
                        <button
                          key={client.id}
                          onClick={() => toggleClient(client.id)}
                          className="flex items-center gap-2 w-full px-1 py-1 rounded-lg hover:bg-gray-50 transition text-left group"
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center border-2 transition ${
                            isVisible ? color.check : "border-gray-300 bg-white"
                          }`}>
                            {isVisible && <Check className="h-3 w-3" />}
                          </div>
                          <span className={`text-xs font-medium truncate flex-1 ${isVisible ? "text-gray-800" : "text-gray-400"}`}>
                            {client.name}
                          </span>
                          {apptCount > 0 && (
                            <span className="text-[10px] text-gray-400">{apptCount}</span>
                          )}
                        </button>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Week View */}
        {viewMode === "week" ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Day headers */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-gray-200 bg-white sticky top-0 z-10">
              <div className="border-r border-gray-100" />
              {weekDays.map((day, i) => {
                const isToday = day.isSame(today, "day");
                return (
                  <div key={i} className={`text-center py-2 border-r border-gray-100 ${i === 6 ? "border-r-0" : ""}`}>
                    <div className={`text-[11px] font-medium uppercase ${isToday ? "text-blue-600" : "text-gray-500"}`}>
                      {day.format("ddd")}
                    </div>
                    <div className={`text-xl font-medium mt-0.5 ${
                      isToday ? "bg-blue-600 text-white w-9 h-9 rounded-full flex items-center justify-center mx-auto" : "text-gray-900"
                    }`}>
                      {day.date()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time grid */}
            <div ref={gridRef} className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-[56px_repeat(7,1fr)] relative" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
                {/* Hour labels */}
                <div className="border-r border-gray-100">
                  {HOURS.map((hour) => (
                    <div key={hour} className="relative" style={{ height: HOUR_HEIGHT }}>
                      <span className="absolute -top-2 right-2 text-[10px] text-gray-400 font-medium">
                        {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {weekDays.map((day, dayIdx) => {
                  const dayAppts = getAppointmentsForDay(day);
                  const daySlots = getSlotsForDay(day);
                  return (
                    <div key={dayIdx} className={`relative border-r border-gray-100 ${dayIdx === 6 ? "border-r-0" : ""}`}>
                      {/* Hour lines */}
                      {HOURS.map((hour) => (
                        <div key={hour} className="border-b border-gray-100" style={{ height: HOUR_HEIGHT }} />
                      ))}

                      {/* Availability slots (color-coded by type) */}
                      {daySlots.map((slot) => {
                        const [sh, sm] = slot.start_time.split(":").map(Number);
                        const [eh, em] = slot.end_time.split(":").map(Number);
                        const startHour = sh + sm / 60;
                        const endHour = eh + em / 60;
                        const topOffset = (startHour - HOURS[0]) * HOUR_HEIGHT;
                        const height = (endHour - startHour) * HOUR_HEIGHT;
                        if (topOffset < 0 || height <= 0) return null;
                        const typeColor = getSlotTypeColor(slot.slot_type || "General", slotTypes);
                        return (
                          <div
                            key={slot.id}
                            className={`absolute left-0 right-0 ${typeColor.bg} border-l-[3px] ${typeColor.border} opacity-70 group/slot`}
                            style={{ top: topOffset, height }}
                          >
                            <div className="flex items-center justify-between px-1.5 py-0.5">
                              <span className={`text-[10px] ${typeColor.text} font-medium truncate`}>{slot.slot_type || "Open"}</span>
                              <button
                                onClick={() => deleteAvailabilitySlot(slot.id)}
                                className={`opacity-0 group-hover/slot:opacity-100 p-0.5 rounded hover:bg-white/50 ${typeColor.text} transition shrink-0`}
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Events */}
                      {dayAppts.map((appt, apptIdx) => {
                        const startHour = appt.localTime.hour() + appt.localTime.minute() / 60;
                        const duration = (appt.duration_minutes || 30) / 60;
                        const topOffset = (startHour - HOURS[0]) * HOUR_HEIGHT;
                        const height = Math.max(duration * HOUR_HEIGHT, 24);

                        if (topOffset < 0 || topOffset > HOURS.length * HOUR_HEIGHT) return null;

                        return (
                          <button
                            key={appt.id}
                            onClick={() => setSelectedAppointment(appt)}
                            className={`absolute left-0.5 right-0.5 rounded-lg border-l-[3px] px-1.5 py-0.5 text-left overflow-hidden cursor-pointer hover:opacity-90 transition-opacity ${eventColorClass(appt.contacts.id, uniqueClients)}`}
                            style={{ top: topOffset, height }}
                          >
                            <div className="text-[11px] font-semibold truncate">{appt.service_type}</div>
                            {height > 30 && <div className="text-[10px] opacity-70 truncate">{appt.contacts.name}</div>}
                            {height > 44 && <div className="text-[10px] opacity-60">{appt.localTime.format("h:mm A")}</div>}
                          </button>
                        );
                      })}

                      {/* Current time indicator */}
                      {day.isSame(today, "day") && (() => {
                        const now = dayjs();
                        const nowHour = now.hour() + now.minute() / 60;
                        const top = (nowHour - HOURS[0]) * HOUR_HEIGHT;
                        if (top < 0 || top > HOURS.length * HOUR_HEIGHT) return null;
                        return (
                          <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
                            <div className="flex items-center">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
                              <div className="flex-1 h-[2px] bg-red-500" />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Month View */
          <div className="flex-1 flex flex-col min-h-0 p-4">
            <div className="grid grid-cols-7 gap-0 mb-1">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 flex-1 border border-gray-200 rounded-xl overflow-hidden">
              {monthWeeks.flat().map((day, i) => {
                const isToday = day.isSame(today, "day");
                const isCurrentMonth = day.month() === monthDate.month();
                const dayAppts = getAppointmentsForDay(day);
                return (
                  <div key={i} className={`border-b border-r border-gray-100 p-1 min-h-[80px] ${!isCurrentMonth ? "bg-gray-50" : "bg-white"}`}>
                    <div className={`text-xs font-medium mb-1 text-center ${
                      isToday ? "bg-black text-white w-6 h-6 rounded-full flex items-center justify-center mx-auto" :
                      !isCurrentMonth ? "text-gray-300" : "text-gray-700"
                    }`}>
                      {day.date()}
                    </div>
                    {dayAppts.slice(0, 2).map((appt, ai) => (
                      <button
                        key={appt.id}
                        onClick={() => setSelectedAppointment(appt)}
                        className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate mb-0.5 ${eventColorClass(appt.contacts.id, uniqueClients)} hover:opacity-80`}
                      >
                        {appt.localTime.format("h:mma")} {appt.service_type}
                      </button>
                    ))}
                    {dayAppts.length > 2 && (
                      <div className="text-[10px] text-gray-400 text-center">+{dayAppts.length - 2} more</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Create Appointment Modal ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">New Appointment</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-full hover:bg-gray-100 transition">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Client name" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
                  <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+1..." className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="email@..." className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
                <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Meeting type or topic" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
                  <input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Duration</label>
                  <select value={formDuration} onChange={(e) => setFormDuration(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hr</option>
                    <option value="90">1.5 hr</option>
                    <option value="120">2 hr</option>
                  </select>
                </div>
              </div>
              {/* Reminder */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Reminders</label>
                <div className="flex flex-wrap gap-2">
                  {[{ label: "Immediately", value: "immediate" }, { label: "1 Day Before", value: "1day" }, { label: "5 Hours Before", value: "5hours" }, { label: "1 Hour Before", value: "1hour" }].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormReminderTiming((prev) => prev.includes(opt.value) ? prev.filter((v) => v !== opt.value) : [...prev, opt.value])}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${formReminderTiming.includes(opt.value) ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formReminderChannels.email} onChange={(e) => setFormReminderChannels({ ...formReminderChannels, email: e.target.checked })} className="rounded border-gray-300" />
                    <span className="text-xs text-gray-600">Email reminder</span>
                  </label>
                </div>
              </div>
              <button onClick={handleCreateAppointment} disabled={creating} className="w-full py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 disabled:opacity-50 transition">
                {creating ? "Creating..." : "Create Appointment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Open Slot Modal ─── */}
      {showSlotModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">Add Open Slot</h3>
              <button onClick={() => setShowSlotModal(false)} className="p-1.5 rounded-full hover:bg-gray-100 transition">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              {/* Slot Type Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">Slot Type</label>
                  <button onClick={() => setShowTypeManager(!showTypeManager)} className="text-[10px] text-gray-400 hover:text-gray-600 transition">
                    {showTypeManager ? "Done" : "Manage Types"}
                  </button>
                </div>
                {showTypeManager ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addSlotType()}
                        placeholder="New type name..."
                        className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-black/10"
                      />
                      <button onClick={addSlotType} disabled={!newTypeName.trim()} className="px-2.5 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700 disabled:opacity-40 transition">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {slotTypes.map((type) => {
                        const tc = getSlotTypeColor(type, slotTypes);
                        return (
                          <div key={type} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white transition">
                            <div className="flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${tc.dot}`} />
                              <span className="text-xs text-gray-700">{type}</span>
                            </div>
                            {type !== "General" && (
                              <button onClick={() => removeSlotType(type)} className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition">
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {slotTypes.map((type) => {
                      const tc = getSlotTypeColor(type, slotTypes);
                      const selected = slotType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setSlotType(type)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            selected
                              ? `${tc.bg} ${tc.border} ${tc.text} ring-1 ring-offset-1 ring-gray-300`
                              : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${tc.dot}`} />
                          {type}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                  <input type="time" value={slotStartTime} onChange={(e) => setSlotStartTime(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                  <input type="time" value={slotEndTime} onChange={(e) => setSlotEndTime(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10" />
                </div>
              </div>
              <button onClick={createAvailabilitySlot} disabled={creatingSlot} className="w-full py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 disabled:opacity-50 transition">
                {creatingSlot ? "Creating..." : "Add Open Slot"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Appointment Details Modal ─── */}
      {selectedAppointment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">Appointment Details</h3>
              <div className="flex items-center gap-1">
                {!editingAppointment ? (
                  <button onClick={startEditingAppointment} className="p-1.5 rounded-full hover:bg-gray-100 transition" title="Edit">
                    <Pencil className="h-4 w-4 text-gray-500" />
                  </button>
                ) : (
                  <button onClick={handleSaveAppointment} disabled={savingAppointment} className="p-1.5 rounded-full hover:bg-green-50 transition text-green-600" title="Save">
                    {savingAppointment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                )}
                <button onClick={() => { setSelectedAppointment(null); setEditingAppointment(false); }} className="p-1.5 rounded-full hover:bg-gray-100 transition">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Contact Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="font-medium">{selectedAppointment.contacts.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span>{selectedAppointment.contacts.phone}</span>
                </div>
                {selectedAppointment.contacts.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span>{selectedAppointment.contacts.email}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-3">
                {/* Date & Time */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date & Time</label>
                  {editingAppointment ? (
                    <input type="datetime-local" value={editFields.scheduled_at} onChange={(e) => setEditFields({ ...editFields, scheduled_at: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                  ) : (
                    <div className="text-sm">
                      <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" />{dayjs(selectedAppointment.scheduled_at).format("dddd, MMMM D, YYYY")}</div>
                      <div className="flex items-center gap-2 text-gray-500 ml-6"><Clock className="h-4 w-4 text-gray-400" />{dayjs(selectedAppointment.scheduled_at).format("h:mm A")}</div>
                    </div>
                  )}
                </div>
                {/* Duration */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Duration</label>
                  {editingAppointment ? (
                    <select value={editFields.duration_minutes} onChange={(e) => setEditFields({ ...editFields, duration_minutes: Number(e.target.value) })} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                      <option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hr</option><option value={90}>1.5 hr</option><option value={120}>2 hr</option>
                    </select>
                  ) : (
                    <div className="text-sm text-gray-700">{selectedAppointment.duration_minutes} minutes</div>
                  )}
                </div>
                {/* Service Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Service</label>
                  {editingAppointment ? (
                    <input type="text" value={editFields.service_type} onChange={(e) => setEditFields({ ...editFields, service_type: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                  ) : (
                    <div className="text-sm text-gray-700">{selectedAppointment.service_type}</div>
                  )}
                </div>
                {/* Status */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                    selectedAppointment.status === "confirmed" ? "bg-green-50 text-green-700" :
                    selectedAppointment.status === "pending" ? "bg-yellow-50 text-yellow-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>{selectedAppointment.status}</span>
                </div>
                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                  {editingAppointment ? (
                    <textarea value={editFields.notes} onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })} rows={3} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none" placeholder="Add notes..." />
                  ) : selectedAppointment.notes ? (
                    <div className="text-sm text-gray-600">{selectedAppointment.notes}</div>
                  ) : (
                    <div className="text-sm text-gray-400 italic">No notes</div>
                  )}
                </div>
              </div>

              {/* Call Record & AI Overview */}
              {loadingCallRecord ? (
                <div className="border-t border-gray-200 pt-4 flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading call data...
                </div>
              ) : callRecord ? (
                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Mic className="h-4 w-4 text-cyan-500" /> Call Recording
                  </div>
                  {callRecord.recording_url ? (
                    <audio controls className="w-full h-8 rounded-lg" src={callRecord.recording_url} />
                  ) : (
                    <p className="text-xs text-gray-400 italic">No recording available</p>
                  )}

                  {callRecord.transcript && (
                    <div>
                      <button onClick={() => setShowTranscript(!showTranscript)} className="flex items-center gap-1.5 text-xs text-cyan-600 hover:text-cyan-700 font-medium">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {showTranscript ? "Hide Transcript" : "View Transcript"}
                      </button>
                      {showTranscript && (
                        <div className="mt-2 max-h-48 overflow-y-auto bg-gray-50 rounded-xl p-3 border border-gray-200 text-xs text-gray-600 space-y-1.5">
                          {Array.isArray(callRecord.transcript) ? callRecord.transcript.map((entry: any, i: number) => (
                            <div key={i}>
                              <span className="font-semibold text-gray-800">{entry.role === "assistant" ? "AI" : "Caller"}:</span>{" "}
                              {entry.content || entry.message || entry.text}
                            </div>
                          )) : (
                            <pre className="whitespace-pre-wrap">{typeof callRecord.transcript === "string" ? callRecord.transcript : JSON.stringify(callRecord.transcript, null, 2)}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {callRecord.summary ? (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-500" /> AI Overview
                      </div>
                      <p className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 border border-gray-200">{callRecord.summary}</p>
                    </div>
                  ) : aiOverview ? (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-500" /> AI Overview
                      </div>
                      <p className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 border border-gray-200">{aiOverview}</p>
                    </div>
                  ) : callRecord.transcript ? (
                    <button onClick={generateAiOverview} disabled={loadingAiOverview} className="flex items-center gap-1.5 text-xs text-cyan-600 hover:text-cyan-700 font-medium disabled:opacity-50">
                      {loadingAiOverview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Generate AI Overview
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* Reminders */}
              <div className="border-t border-gray-200 pt-4">
                <label className="block text-xs font-medium text-gray-500 mb-2">Email Reminder</label>
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input type="checkbox" checked={appointmentReminderChannels.email} onChange={(e) => setAppointmentReminderChannels({ ...appointmentReminderChannels, email: e.target.checked })} disabled={!selectedAppointment.contacts.email} className="rounded border-gray-300 disabled:opacity-50" />
                  <span className={`text-xs ${!selectedAppointment.contacts.email ? "text-gray-400" : "text-gray-600"}`}>
                    Email {!selectedAppointment.contacts.email && "(no email provided)"}
                  </span>
                </label>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {[{ label: "Immediately", value: "immediate" }, { label: "1 Day Before", value: "1day" }, { label: "5 Hours Before", value: "5hours" }, { label: "1 Hour Before", value: "1hour" }].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAppointmentReminderTiming((prev) => prev.includes(opt.value) ? prev.filter((v) => v !== opt.value) : [...prev, opt.value])}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition ${appointmentReminderTiming.includes(opt.value) ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button onClick={handleSaveReminders} disabled={savingReminders || loadingReminders} className="w-full py-2 rounded-xl bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-700 disabled:opacity-50 transition">
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
