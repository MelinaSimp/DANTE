"use client";

import { useEffect, useRef } from "react";

export default function WatcherBridge() {
  const syncedRef = useRef(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.watched) return;

    let unsubscribe: (() => void) | null = null;

    const boot = async () => {
      if (syncedRef.current) return;
      syncedRef.current = true;

      try {
        const res = await fetch("/api/electron/watched-folders");
        if (!res.ok) return;
        const { folders } = await res.json();
        const active = (folders || []).filter(
          (f: { status: string }) => f.status === "active",
        );
        if (active.length === 0) return;

        await api.watched!.sync(active);

        unsubscribe = api.watched!.onFileEvent(async (event) => {
          const folder = active.find(
            (f: { id: string }) => f.id === event.folder_id,
          );
          if (!folder) return;

          let extractedText: string | undefined;
          if (
            folder.default_processing_mode !== "local_only" &&
            api.watched?.extractFileText
          ) {
            try {
              const result = await api.watched.extractFileText(
                event.file_path,
                event.file_extension,
              );
              if ("text" in result && result.text) {
                extractedText = result.text;
              }
            } catch {
              // extraction failed — still notify with metadata only
            }
          }

          try {
            await fetch(
              `/api/electron/watched-folders/${event.folder_id}/notify`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  file_path: event.file_path,
                  file_name: event.file_name,
                  file_extension: event.file_extension,
                  file_size_bytes: event.file_size_bytes,
                  content_sha256: event.content_sha256,
                  extracted_text: extractedText,
                }),
              },
            );
          } catch {
            // network error — file will be picked up on next rescan
          }
        });
      } catch {
        syncedRef.current = false;
      }
    };

    boot();

    return () => {
      unsubscribe?.();
    };
  }, []);

  return null;
}
