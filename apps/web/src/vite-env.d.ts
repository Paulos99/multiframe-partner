/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_YM_ID?: string;
  readonly VITE_ANALYTICS_INGEST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
