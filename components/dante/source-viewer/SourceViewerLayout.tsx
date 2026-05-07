"use client";

// SourceViewerLayout — wraps a chat surface with the
// SourceViewerProvider, applies right-padding when the panel is
// open so messages don't slide under it, and renders the
// SourceViewer panel itself.
//
// Usage: drop in around chat content. SourceViewerProvider gives
// CitationRenderer (anywhere inside) access to openSource().
//
//   <SourceViewerLayout>
//     <ChatContent />
//   </SourceViewerLayout>
//
// The shrink animates via Tailwind's transition-all so the user
// sees the chat ease over rather than jump.

import type { ReactNode } from "react";
import {
  SourceViewerProvider,
  useSourceViewer,
} from "./SourceViewerContext";
import SourceViewer from "./SourceViewer";

export default function SourceViewerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SourceViewerProvider>
      <ShrinkOnOpen>{children}</ShrinkOnOpen>
      <SourceViewer />
    </SourceViewerProvider>
  );
}

function ShrinkOnOpen({ children }: { children: ReactNode }) {
  const { active } = useSourceViewer();
  return (
    <div
      className={`transition-[padding] duration-300 ease-out ${
        active ? "pr-[50%]" : "pr-0"
      }`}
    >
      {children}
    </div>
  );
}
