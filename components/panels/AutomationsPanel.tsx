"use client";

import { useState, useEffect } from "react";
import { Zap, Play, Pause, Clock, CheckCircle2, MessageSquare, Mail, Phone, Calendar, Loader2 } from "lucide-react";

interface AutomationEvent {
  id: string;
  event_type: string;
  direction: string;
  payload: any;
  created_at: string;
}

interface AutomationRule {
  id: string;
  trigger_event: string;
  action_description: string;
  channel: string;
  active: boolean;
}

const QUICK_ACTIONS = [
  {
    id: "email-followup",
    name: "Email Follow-up",
    description: "Send a follow-up email when an appointment is booked",
    icon: Mail,
    trigger: "appointment.booked",
    action: "Send follow-up email to confirm appointment details",
    channel: "email",
  },
  {
    id: "sms-reminder",
    name: "SMS Reminder",
    description: "Send SMS notification when a new contact is created",
    icon: Phone,
    trigger: "contact.created",
    action: "Send SMS welcome message to new contact",
    channel: "sms",
  },
  {
    id: "sale-notification",
    name: "Sale Alert Email",
    description: "Send email notification when a sale is recorded",
    icon: Mail,
    trigger: "sale.recorded",
    action: "Send email alert with sale details",
    channel: "email",
  },
  {
    id: "email-new-contact",
    name: "Welcome Email",
    description: "Auto-send welcome email when a new contact is created",
    icon: MessageSquare,
    trigger: "contact.created",
    action: "Send welcome email to new contact",
    channel: "email",
  },
];

export default function AutomationsPanel({ agentId }: { agentId: string }) {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setLoadingEvents(true);
    fetch("/api/automations/events", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => setEvents(Array.isArray(d) ? d.slice(0, 20) : []))
      .catch(() => {})
      .finally(() => setLoadingEvents(false));
  }, []);

  useEffect(() => {
    fetch(`/api/agents/${agentId}/automation-rules`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => setRules(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingRules(false));
  }, [agentId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const isQuickActionActive = (actionId: string) => {
    const qa = QUICK_ACTIONS.find(a => a.id === actionId);
    if (!qa) return false;
    return rules.some(r => r.trigger_event === qa.trigger && r.channel === qa.channel && r.active);
  };

  const handleActivate = async (actionId: string) => {
    const qa = QUICK_ACTIONS.find(a => a.id === actionId);
    if (!qa) return;

    setActivating(actionId);

    const existingRule = rules.find(r => r.trigger_event === qa.trigger && r.channel === qa.channel);

    try {
      if (existingRule) {
        const r = await fetch(`/api/agents/${agentId}/automation-rules`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: existingRule.id, active: !existingRule.active }),
        });
        if (r.ok) {
          const updated = await r.json();
          setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
          setToast({ type: "success", message: updated.active ? "Automation activated" : "Automation paused" });
        }
      } else {
        const r = await fetch(`/api/agents/${agentId}/automation-rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            trigger_event: qa.trigger,
            action_description: qa.action,
            channel: qa.channel,
          }),
        });
        if (r.ok) {
          const newRule = await r.json();
          setRules(prev => [newRule, ...prev]);
          setToast({ type: "success", message: "Automation activated" });
        }
      }
    } catch {
      setToast({ type: "error", message: "Failed to update automation" });
    } finally {
      setActivating(null);
    }
  };

  const eventIcon = (type: string) => {
    if (type.includes("email")) return <Mail className="h-3.5 w-3.5" />;
    if (type.includes("call")) return <Phone className="h-3.5 w-3.5" />;
    if (type.includes("appointment")) return <Calendar className="h-3.5 w-3.5" />;
    if (type.includes("contact")) return <MessageSquare className="h-3.5 w-3.5" />;
    return <Zap className="h-3.5 w-3.5" />;
  };

  return (
    <div className="p-4 space-y-6">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
          toast.type === "success" ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"
        }`}>{toast.message}</div>
      )}

      {/* Status */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-green-50 border border-green-200 text-green-600">
        <CheckCircle2 className="h-4 w-4" />
        Automations active — {rules.filter(r => r.active).length} rule{rules.filter(r => r.active).length !== 1 ? "s" : ""} enabled
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan-500" />
          Quick Automations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon;
            const isActive = isQuickActionActive(action.id);
            const isLoading = activating === action.id;
            return (
              <div
                key={action.id}
                className={`relative p-4 rounded-2xl border transition-all ${
                  isActive
                    ? "bg-green-50 border-green-200 shadow-sm"
                    : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    isActive ? "bg-green-100" : "bg-gray-100"
                  }`}>
                    <Icon className={`h-4 w-4 ${isActive ? "text-green-600" : "text-gray-500"}`} />
                  </div>
                  <button
                    onClick={() => handleActivate(action.id)}
                    disabled={isLoading}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                      isActive
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {isActive ? "Active" : "Activate"}
                  </button>
                </div>
                <h4 className="text-sm font-medium text-gray-900">{action.name}</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">{action.description}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 font-mono">{action.trigger}</span>
                  <span className="text-[10px] text-gray-300">&rarr;</span>
                  <span className="text-[10px] text-gray-400">{action.channel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity Log */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          Recent Activity
        </h3>
        {loadingEvents ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>
        ) : events.length === 0 ? (
          <div className="text-center py-8">
            <Zap className="h-8 w-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No automation events yet</p>
            <p className="text-xs text-gray-300 mt-1">Events will appear here once automations run</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {events.map(evt => (
              <div key={evt.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                <div className="text-gray-400">{eventIcon(evt.event_type)}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-gray-700 font-mono">{evt.event_type}</span>
                  <span className="text-[10px] text-gray-400 ml-2">{evt.direction}</span>
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">{new Date(evt.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
