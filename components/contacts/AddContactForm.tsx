// components/contacts/AddContactForm.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  created_at: string;
}

interface AddContactFormProps {
  workspaceId: string;
  contact?: Contact;
  onContactAdded: (contact: Contact) => void;
  onCancel: () => void;
}

export default function AddContactForm({ workspaceId, contact, onContactAdded, onCancel }: AddContactFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!contact;

  useEffect(() => {
    if (contact) {
      setName(contact.name);
      setEmail(contact.email || "");
      setPhone(contact.phone);
      setNotes(contact.notes || "");
    }
  }, [contact]);

  const validateForm = () => {
    if (!name.trim()) {
      setError("Name is required");
      return false;
    }
    if (!phone.trim()) {
      setError("Phone number is required");
      return false;
    }
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email address");
      return false;
    }
    return true;
  };

  async function handleSubmit() {
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const contactData = {
        workspace_id: workspaceId,
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim(),
        notes: notes.trim() || null,
      };

      let response;
      if (isEditing) {
        response = await fetch(`/api/contacts/${contact.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(contactData),
        });
      } else {
        response = await fetch('/api/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(contactData),
        });
      }

      if (response.ok) {
        const newContact = await response.json();
        onContactAdded(newContact);
      } else {
        const errorData = await response.json();
        setError(errorData.error || `Failed to ${isEditing ? 'update' : 'create'} contact`);
      }
    } catch (error) {
      console.error('Contact operation error:', error);
      setError(`Failed to ${isEditing ? 'update' : 'create'} contact. Please try again.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--ink-muted)] mb-1">
            Name *
          </label>
          <input
            className="w-full rounded-xl border border-[var(--glass-border)] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent shadow-sm hover:shadow-md transition-shadow"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--ink-muted)] mb-1">
            Phone *
          </label>
          <input
            className="w-full rounded-xl border border-[var(--glass-border)] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent shadow-sm hover:shadow-md transition-shadow"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--ink-muted)] mb-1">
            Email
          </label>
          <input
            type="email"
            className="w-full rounded-xl border border-[var(--glass-border)] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent shadow-sm hover:shadow-md transition-shadow"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-[var(--ink-muted)] mb-1">
            Notes
          </label>
          <textarea
            className="w-full rounded-xl border border-[var(--glass-border)] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent shadow-sm hover:shadow-md transition-shadow"
            placeholder="Additional notes about this contact"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button 
          onClick={handleSubmit} 
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 font-medium py-3"
        >
          {loading ? (isEditing ? "Updating..." : "Adding...") : (isEditing ? "Update Contact" : "Add Contact")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border-[var(--glass-border)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)] shadow-sm hover:shadow-md transition-all duration-200"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

