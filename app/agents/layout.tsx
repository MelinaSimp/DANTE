// app/agents/layout.tsx
// This layout hides the global header for the agents page to match GigaAI fullscreen design

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen overflow-hidden">
      {children}
    </div>
  );
}











