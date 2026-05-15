"use client";

import { useEffect, useRef } from "react";

export default function WatcherBridge() {
  const syncedRef = useRef(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.watched) {
      console.log("[WatcherBridge] not in Electron, skipping");
      return;
    }

    let unsubscribe: (() => void) | null = null;

    const boot = async () => {
      if (syncedRef.current) return;
      syncedRef.current = true;

      console.log("[WatcherBridge] booting...");

      try {
        const res = await fetch("/api/electron/watched-folders");
        if (!res.ok) {
          console.warn("[WatcherBridge] failed to fetch folders:", res.status);
          syncedRef.current = false;
          return;
        }
        const { folders } = await res.json();
        const active = (folders || []).filter(
          (f: { status: string }) => f.status === "active",
        );
        console.log(`[WatcherBridge] ${active.length} active folder(s)`);
        if (active.length === 0) return;

        const syncResult = await api.watched!.sync(active);
        console.log("[WatcherBridge] sync result:", syncResult);

        unsubscribe = api.watched!.onFileEvent(async (event) => {
          console.log("[WatcherBridge] file event:", event.file_name, event.folder_id);

          const folder = active.find(
            (f: { id: string }) => f.id === event.folder_id,
          );
          if (!folder) {
            console.warn("[WatcherBridge] no matching folder for event, skipping");
            return;
          }

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
                console.log(`[WatcherBridge] extracted ${result.text.length} chars from ${event.file_name}`);
              }
            } catch (err) {
              console.warn("[WatcherBridge] extraction failed:", err);
            }
          }

          try {
            const notifyRes = await fetch(
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
            console.log(`[WatcherBridge] notify ${event.file_name}: ${notifyRes.status}`);
          } catch (err) {
            console.warn("[WatcherBridge] notify failed:", err);
          }
        });

        console.log("[WatcherBridge] listening for file events");
      } catch (err) {
        console.error("[WatcherBridge] boot failed:", err);
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
