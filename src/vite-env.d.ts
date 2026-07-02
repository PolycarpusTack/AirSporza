/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /** Feature flag (ADR-012): Ops redesign shell at /ops/*. 'true' = on; absent/other = off. */
  readonly VITE_OPS_REDESIGN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
