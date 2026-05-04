// types/electron-api.d.ts
//
// Shared global declarations for the IPC bridges exposed by
// electron/preload.js. Both window.electronAPI (general bridge)
// and window.driftLocal (local-LLM bridge) live here. Web (non-
// Electron) builds see these as undefined; renderer code
// feature-detects via `if (window.driftLocal)` etc.
//
// Keep this file as the single source — duplicate `declare global`
// blocks across components fight each other for the canonical type.

export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      platform?: NodeJS.Platform;
      versions?: { node: string; chrome: string; electron: string };

      /** Phase 9 — agentic PDF intake. Opens an OS file picker,
       *  reads the PDFs, runs pdf-parse in main, returns
       *  extracted text only. */
      pickAndExtractPdfs?: () => Promise<
        Array<{ name: string; text: string; size?: number; error?: string }>
      >;

      /** Hermes Phase 2 — watched folders. */
      watched?: {
        pickFolder: () => Promise<{
          canceled: boolean;
          folder_path?: string;
        }>;
        sync: (folders: unknown[]) => Promise<{ ok: boolean }>;
        onFileEvent: (
          handler: (event: {
            folder_id: string;
            file_path: string;
            file_name: string;
            file_extension: string;
            file_size_bytes: number | null;
            content_sha256: string | null;
            kind_of_event: "added" | "changed";
          }) => void,
        ) => () => void;
      };

      /** Persistent device identity for this Electron install. */
      getDevice?: () => Promise<{
        device_id: string;
        device_label: string;
        created_at?: string;
      }>;
    };

    /** Hermes Phase 2 — local LLM bridge. Bypasses the cloud
     *  entirely; the renderer talks straight to localhost Ollama
     *  via IPC. Undefined in the web build. */
    driftLocal?: {
      probe: () => Promise<{
        reachable: boolean;
        base_url: string;
        models_available: string[];
        hermes_pulled: boolean;
        error?: string;
      }>;
      /** Multi-select file picker with text extraction in main
       *  process. Returns extracted text only — bytes stay local. */
      pickAndReadFiles: () => Promise<
        Array<{
          name: string;
          path: string;
          size: number;
          ext: string;
          text: string;
          error: string | null;
          truncated: boolean;
        }>
      >;
      complete: (opts: {
        messages: Array<{ role: string; content: string }>;
        model?: string;
        temperature?: number;
        responseFormat?: { type: string };
      }) => Promise<{
        message: { role: string; content: string };
        finishReason: string;
        usage: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
      }>;
      embed: (opts: {
        input: string | string[];
        model?: string;
      }) => Promise<number[][]>;
      ensureRunning: () => Promise<{
        started: boolean;
        reachable: boolean;
        reason?: string;
      }>;
    };
  }
}
