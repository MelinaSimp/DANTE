"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import AddContactForm from "./AddContactForm";
import ContactImporter from "./ContactImporter";
import AnalyzeContactAI from "@/components/ai/AnalyzeContactAI";
import AddTaskForm from "@/components/tasks/AddTaskForm";
import TaskItem from "@/components/tasks/TaskItem";
import AddNoteForm from "@/components/notes/AddNoteForm";
import { FileText, Mail, Mic, NotebookPen, Phone, Upload, User, X } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm-dialog";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  created_at: string;
}

interface ContactsClientProps {
  initialContacts: Contact[];
  workspaceId: string;
}

interface Note {
  id: string;
  body: string;
  created_at: string;
}

interface Task {
  id: string;
  title: string;
  details: string | null;
  status: string;
  due_at: string | null;
  created_at: string;
}

export default function ContactsClient({ initialContacts, workspaceId }: ContactsClientProps) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const handleContactAdded = (newContact: Contact) => {
    setContacts(prev => [...prev, newContact].sort((a, b) => 
      a.name.localeCompare(b.name)
    ));
    setShowAddForm(false);
    setError(null);
  };

  // Pull the latest contacts for this workspace after a bulk import.
  // The importer API inserts directly; the client has no way to know
  // what rows came back without a refetch.
  const refetchContacts = async () => {
    const { data, error: fetchErr } = await supabase
      .from("contacts")
      .select("id, name, phone, email, notes, created_at")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true });
    if (fetchErr) {
      console.error("Failed to refetch contacts after import:", fetchErr);
      return;
    }
    setContacts((data as Contact[]) || []);
  };

  const handleContactUpdated = (updatedContact: Contact) => {
    setContacts(prev => prev.map(contact => 
      contact.id === updatedContact.id ? updatedContact : contact
    ).sort((a, b) => a.name.localeCompare(b.name)));
    setEditingContact(null);
    setError(null);
  };

  const loadContactData = async (contact: Contact) => {
    setSelectedContact(contact);
    
    // Load notes for this contact
    const { data: notesData } = await supabase
      .from("notes")
      .select("*")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false });
    setNotes(notesData || []);

    // Load tasks for this contact
    const { data: tasksData } = await supabase
      .from("tasks")
      .select("*")
      .eq("contact_id", contact.id)
      .order("due_at", { ascending: true });
    setTasks(tasksData || []);
  };

  const handleDeleteContact = async (contactId: string) => {
    const ok = await confirmDialog({
      title: "Delete contact?",
      message: "Are you sure you want to delete this contact? This action cannot be undone.",
      confirmText: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setIsDeleting(contactId);
    setError(null);
    
    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setContacts(prev => prev.filter(contact => contact.id !== contactId));
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete contact');
      }
    } catch (error) {
      console.error('Delete contact error:', error);
      setError('Failed to delete contact. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-8 text-[#151515]">
      {error && (
        <div className="flex items-start rounded-xl border border-[#f0494a]/40 bg-[#fef2f2] p-4 text-sm text-[#f0494a]">
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="ml-3 flex-1">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-3 text-[#f0494a]/70 transition hover:text-[#f0494a]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#151515]">All Contacts</h2>
        <div className="flex items-center gap-2">
          <Link
            href="/call"
            className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#151515] shadow-sm transition hover:border-red-500 hover:text-red-600"
          >
            <Mic className="h-4 w-4" />
            Start Call
          </Link>
          <button
            onClick={() => setShowImporter(true)}
            className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#151515] shadow-sm transition hover:border-[#3166bf] hover:text-[#3166bf]"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <Button
            onClick={() => setShowAddForm(true)}
            className="rounded-full bg-[#3166bf] px-5 py-2 text-white shadow-lg transition hover:bg-[#2a5aa8]"
          >
            Add Contact
          </Button>
        </div>
      </div>

      {showImporter && (
        <ContactImporter
          onClose={() => setShowImporter(false)}
          onImported={refetchContacts}
        />
      )}

      {showAddForm && (
        <div className="rounded-2xl border border-[#e5e7eb] bg-[#ffffff] p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-[#151515]">Add New Contact</h3>
          <AddContactForm 
            workspaceId={workspaceId}
            onContactAdded={handleContactAdded}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {editingContact && (
        <div className="rounded-2xl border border-[#e5e7eb] bg-[#ffffff] p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-[#151515]">Edit Contact</h3>
          <AddContactForm 
            workspaceId={workspaceId}
            contact={editingContact}
            onContactAdded={handleContactUpdated}
            onCancel={() => setEditingContact(null)}
          />
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="rounded-2xl border border-[#e5e7eb] bg-[#ffffff] p-12 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#3166bf]/30">
            <User className="h-6 w-6 text-[#3166bf]" />
          </div>
          <p className="text-lg font-medium text-[#151515]">No contacts yet.</p>
          <p className="mt-2 text-sm text-[#151515]/60">Add your first contact to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="group rounded-3xl border border-[#e5e7eb] bg-[#ffffff] p-8 shadow-sm transition-all duration-200 hover:-translate-y-2 hover:border-[#3166bf]/50 hover:shadow-md"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3166bf]/30 text-lg text-[#3166bf]">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#151515]/60">Contact</p>
                      <h3 className="text-2xl font-semibold text-[#151515]">{contact.name}</h3>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/client-details-overview?contactId=${contact.id}`}
                    className="inline-flex items-center gap-1 rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#151515] transition hover:border-[#3166bf] hover:bg-[#3166bf]/10 hover:text-[#3166bf]"
                  >
                    <FileText className="h-3 w-3" />
                    Docs
                  </Link>
                  <Link
                    href={`/call?contactId=${contact.id}`}
                    className="inline-flex items-center gap-1 rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#151515] transition hover:border-red-500 hover:bg-red-50 hover:text-red-600"
                    title="Record a call with this client"
                  >
                    <Mic className="h-3 w-3" />
                    Call
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loadContactData(contact)}
                    className="rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#151515] transition hover:border-[#3166bf] hover:bg-[#3166bf]/10 hover:text-[#3166bf]"
                  >
                    Details
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingContact(contact)}
                    className="rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#151515] transition hover:border-[#3166bf] hover:bg-[#3166bf]/10 hover:text-[#3166bf]"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteContact(contact.id)}
                    disabled={isDeleting === contact.id}
                    className="rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#f0494a] transition hover:border-[#f0494a] hover:bg-[#fef2f2] hover:text-[#f0494a] disabled:opacity-50"
                  >
                    {isDeleting === contact.id ? "…" : "Delete"}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-5 text-sm text-[#151515]/70">
                <div className="flex items-center">
                  <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#3166bf]/20 text-[#3166bf]"><Phone className="h-4 w-4" /></div>
                  <div>
                    <span className="text-xs uppercase tracking-wide text-[#151515]/60">Phone</span>
                    <div>
                      <a href={`tel:${contact.phone}`} className="text-sm font-medium text-[#3166bf] hover:underline">
                        {contact.phone}
                      </a>
                    </div>
                  </div>
                </div>
                
                {contact.email && (
                  <div className="flex items-center">
                    <div className="mr-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#3166bf]/20 text-[#3166bf]">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide text-[#151515]/60">Email</span>
                      <div>
                        <a href={`mailto:${contact.email}`} className="text-sm font-medium text-[#3166bf] hover:underline">
                          {contact.email}
                        </a>
                      </div>
                    </div>
                  </div>
                )}
                
                {contact.notes && (
                  <div className="flex items-start">
                    <div className="mr-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#3166bf]/20 text-[#3166bf]">
                      <NotebookPen className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide text-[#151515]/60">Notes</span>
                      <p className="mt-2 rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] p-3 text-sm text-[#151515]/70">{contact.notes}</p>
                    </div>
                  </div>
                )}
                
                <div className="rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] p-3 text-xs text-[#151515]/60">
                  <span className="font-medium text-[#151515]">Added:</span> {new Date(contact.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact Details View */}
      {selectedContact && (
        <div className="mt-12 space-y-8 rounded-3xl border border-[#e5e7eb] bg-[#ffffff] p-8 shadow-lg">
          <div className="flex flex-col gap-4 border-b border-[#e5e7eb] pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#151515]/60">Contact Overview</p>
              <h2 className="text-3xl font-semibold text-[#151515]">
                {selectedContact.name}
              </h2>
              <p className="mt-1 text-[#151515]/60">Contact information, intelligence, and follow-ups</p>
            </div>
            <Button
              variant="ghost"
              onClick={() => setSelectedContact(null)}
              className="rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-4 py-2 text-sm font-medium text-[#151515] transition hover:border-[#151515] hover:bg-[#e5e7eb]"
            >
              <X className="h-4 w-4" /> Close
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Contact Info */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-[#ffffff] p-6 shadow-sm">
              <h3 className="mb-6 text-xl font-semibold text-[#151515]">Contact Information</h3>
              <div className="space-y-5 text-sm">
                <div>
                  <span className="text-xs uppercase tracking-wide text-[#151515]/60">Name</span>
                  <div className="mt-1 text-lg font-semibold text-[#151515]">{selectedContact.name}</div>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wide text-[#151515]/60">Phone</span>
                  <div className="mt-1 text-lg font-semibold text-[#3166bf]">{selectedContact.phone}</div>
                </div>
                {selectedContact.email && (
                  <div>
                    <span className="text-xs uppercase tracking-wide text-[#151515]/60">Email</span>
                    <div className="mt-1 text-lg font-semibold text-[#3166bf]">{selectedContact.email}</div>
                  </div>
                )}
                {selectedContact.notes && (
                  <div>
                    <span className="text-xs uppercase tracking-wide text-[#151515]/60">Notes</span>
                    <div className="mt-2 rounded-xl border border-[#e5e7eb] bg-[#f3f4f6] p-3 text-[#151515]/70">
                      {selectedContact.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* AI Analysis */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-[#ffffff] p-6 shadow-sm">
              <h3 className="mb-6 text-xl font-semibold text-[#151515]">AI Analysis</h3>
              <AnalyzeContactAI 
                contactId={selectedContact.id}
                workspaceId={workspaceId}
              />
            </div>
          </div>

          {/* Notes Section */}
          <div className="rounded-2xl border border-[#e5e7eb] bg-[#ffffff] p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[#151515]">Notes</h3>
            </div>
            <AddNoteForm contactId={selectedContact.id} />
            <div className="mt-6 space-y-4">
              {notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-[#e5e7eb] bg-[#f3f4f6] p-4 shadow-sm transition hover:border-[#3166bf] hover:shadow-md">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#151515]/60">
                    {new Date(note.created_at).toLocaleString()}
                  </div>
                  <div className="text-sm text-[#151515]">{note.body}</div>
                </div>
              ))}
              {notes.length === 0 && (
                <div className="py-8 text-center text-sm text-[#151515]/60">
                  No notes yet. Add a note above to get started.
                </div>
              )}
            </div>
          </div>

          {/* Tasks Section */}
          <div className="rounded-2xl border border-[#e5e7eb] bg-[#ffffff] p-6 shadow-sm">
            <h3 className="mb-6 text-xl font-semibold text-[#151515]">Tasks</h3>
            <AddTaskForm 
              workspaceId={workspaceId}
              contactId={selectedContact.id}
            />
            <div className="mt-6 space-y-4">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-xl border border-[#e5e7eb] bg-[#f3f4f6] p-4 shadow-sm transition hover:border-[#3166bf] hover:shadow-md">
                  <TaskItem task={task} />
                </div>
              ))}
              {tasks.length === 0 && (
                <div className="py-8 text-center text-sm text-[#151515]/60">
                  No tasks yet. Add a task above to get started.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
