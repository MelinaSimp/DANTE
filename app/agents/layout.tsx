// app/agents/layout.tsx
//
// Fullscreen layout for the Agent Builder — suppresses the global shell
// (sidebar + header) the rest of the app gets from app/layout.tsx so the
// builder can claim the full viewport. Background is Harvey canvas so
// the builder doesn't pop against a dark parent.

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="h-screen overflow-hidden"
      style={{ background: "var(--canvas)", color: "var(--ink)" }}
    >
      {children}
    </div>
  );
}
