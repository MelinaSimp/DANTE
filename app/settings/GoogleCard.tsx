"use client";

// Thin wrapper kept for backward compat with the existing Settings
// nav. The actual UI lives in MailboxCard, which is parameterized
// by provider so the Microsoft panel can reuse it.

import MailboxCard from "./MailboxCard";

export default function GoogleCard() {
  return <MailboxCard provider="google" />;
}
