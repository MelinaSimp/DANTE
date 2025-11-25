"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import AddContactForm from "./AddContactForm";
import AnalyzeContactAI from "@/components/ai/AnalyzeContactAI";
import AddTaskForm from "@/components/tasks/AddTaskForm";
import TaskItem from "@/components/tasks/TaskItem";
import AddNoteForm from "@/components/notes/AddNoteForm";

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
    if (!confirm("Are you sure you want to delete this contact? This action cannot be undone.")) {
      return;
    }

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
    <div className="space-y-8 text-white">
      {error && (
        <div className="flex items-start rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="ml-3 flex-1">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-3 text-red-200/70 transition hover:text-red-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white/90">All Contacts</h2>
        <Button 
          onClick={() => setShowAddForm(true)}
          className="rounded-full bg-[#3351ff] px-5 py-2 text-white shadow-lg transition hover:bg-[#4a64ff]"
        >
          Add Contact
        </Button>
      </div>

      {showAddForm && (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-white">Add New Contact</h3>
          <AddContactForm 
            workspaceId={workspaceId}
            onContactAdded={handleContactAdded}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {editingContact && (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-white">Edit Contact</h3>
          <AddContactForm 
            workspaceId={workspaceId}
            contact={editingContact}
            onContactAdded={handleContactUpdated}
            onCancel={() => setEditingContact(null)}
          />
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-12 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#3351ff]/30">
            <span className="text-2xl text-[#7a8dff]">👤</span>
          </div>
          <p className="text-lg font-medium text-white">No contacts yet.</p>
          <p className="mt-2 text-sm text-white/60">Add your first contact to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="group rounded-3xl border border-white/10 bg-black/45 p-8 shadow-[0_25px_60px_rgba(15,15,16,0.45)] transition-all duration-200 hover:-translate-y-2 hover:border-[#3351ff]/50 hover:bg-black/35"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3351ff]/30 text-lg text-[#91a6ff]">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-white/35">Contact</p>
                      <h3 className="text-2xl font-semibold text-white">{contact.name}</h3>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadContactData(contact)}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-1 text-xs font-medium text-white/80 transition hover:border-[#35d399]/40 hover:bg-[#35d399]/20 hover:text-[#67fdbd]"
                  >
                    View Details
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingContact(contact)}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-1 text-xs font-medium text-white/80 transition hover:border-[#3351ff]/40 hover:bg-[#3351ff]/20 hover:text-[#a5b5ff]"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteContact(contact.id)}
                    disabled={isDeleting === contact.id}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-1 text-xs font-medium text-red-300 transition hover:border-red-400/50 hover:bg-red-500/15 hover:text-red-200 disabled:opacity-50"
                  >
                    {isDeleting === contact.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-5 text-sm text-white/70">
                <div className="flex items-center">
                  <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#3351ff]/35 text-lg text-[#91a6ff]">📞</div>
                  <div>
                    <span className="text-xs uppercase tracking-wide text-white/40">Phone</span>
                    <div>
                      <a href={`tel:${contact.phone}`} className="text-sm font-medium text-[#7a8dff] hover:underline">
                        {contact.phone}
                      </a>
                    </div>
                  </div>
                </div>
                
                {contact.email && (
                  <div className="flex items-center">
                    <div className="mr-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#3351ff]/30 text-[#7a8dff]">
                      ✉️
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide text-white/40">Email</span>
                      <div>
                        <a href={`mailto:${contact.email}`} className="text-sm font-medium text-[#7a8dff] hover:underline">
                          {contact.email}
                        </a>
                      </div>
                    </div>
                  </div>
                )}
                
                {contact.notes && (
                  <div className="flex items-start">
                    <div className="mr-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#3351ff]/30 text-[#7a8dff]">
                      📝
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide text-white/40">Notes</span>
                      <p className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70">{contact.notes}</p>
                    </div>
                  </div>
                )}
                
                <div className="rounded-lg border border-white/5 bg-white/5 p-3 text-xs text-white/50">
                  <span className="font-medium text-white/70">Added:</span> {new Date(contact.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact Details View */}
      {selectedContact && (
        <div className="mt-12 space-y-8 rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Contact Overview</p>
              <h2 className="text-3xl font-semibold text-white">
                {selectedContact.name}
              </h2>
              <p className="mt-1 text-white/60">Contact information, intelligence, and follow-ups</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setSelectedContact(null)}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              ✕ Close
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Contact Info */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 shadow-lg">
              <h3 className="mb-6 text-xl font-semibold text-white">Contact Information</h3>
              <div className="space-y-5 text-sm">
                <div>
                  <span className="text-xs uppercase tracking-wide text-white/40">Name</span>
                  <div className="mt-1 text-lg font-semibold text-white">{selectedContact.name}</div>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wide text-white/40">Phone</span>
                  <div className="mt-1 text-lg font-semibold text-[#7a8dff]">{selectedContact.phone}</div>
                </div>
                {selectedContact.email && (
                  <div>
                    <span className="text-xs uppercase tracking-wide text-white/40">Email</span>
                    <div className="mt-1 text-lg font-semibold text-[#7a8dff]">{selectedContact.email}</div>
                  </div>
                )}
                {selectedContact.notes && (
                  <div>
                    <span className="text-xs uppercase tracking-wide text-white/40">Notes</span>
                    <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-white/70">
                      {selectedContact.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* AI Analysis */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 shadow-lg">
              <h3 className="mb-6 text-xl font-semibold text-white">AI Analysis</h3>
              <AnalyzeContactAI 
                contactId={selectedContact.id}
                workspaceId={workspaceId}
              />
            </div>
          </div>

          {/* Notes Section */}
          <div className="rounded-2xl border border-white/10 bg-black/30 p-6 shadow-lg">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Notes</h3>
            </div>
            <AddNoteForm contactId={selectedContact.id} />
            <div className="mt-6 space-y-4">
              {notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm transition hover:border-white/20 hover:bg-white/10">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">
                    {new Date(note.created_at).toLocaleString()}
                  </div>
                  <div className="text-sm text-white/80">{note.body}</div>
                </div>
              ))}
              {notes.length === 0 && (
                <div className="py-8 text-center text-sm text-white/50">
                  No notes yet. Add a note above to get started.
                </div>
              )}
            </div>
          </div>

          {/* Tasks Section */}
          <div className="rounded-2xl border border-white/10 bg-black/30 p-6 shadow-lg">
            <h3 className="mb-6 text-xl font-semibold text-white">Tasks</h3>
            <AddTaskForm 
              workspaceId={workspaceId}
              contactId={selectedContact.id}
            />
            <div className="mt-6 space-y-4">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm transition hover:border-white/20 hover:bg-white/10">
                  <TaskItem task={task} />
                </div>
              ))}
              {tasks.length === 0 && (
                <div className="py-8 text-center text-sm text-white/50">
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
