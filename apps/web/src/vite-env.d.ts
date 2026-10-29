/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_YM_ID?: string;
  readonly VITE_ANALYTICS_INGEST_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_STP_PROBLEMOMER_URL?: string;
  readonly VITE_STP_CALCULATOR_URL?: string;
  /** "true" — боевая сборка: демо-режим недоступен. */
  readonly VITE_DISABLE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' {
  export const WorkerMessageHandler: unknown;
}

/** Номер сборки: подставляется при сборке, совпадает с version.json. */
declare const __BUILD_ID__: string;
