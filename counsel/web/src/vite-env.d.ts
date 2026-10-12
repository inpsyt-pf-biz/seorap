/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_COUNSEL_ENV?: string
  readonly VITE_DEV_ACCOUNTS?: string
  readonly VITE_DEV_PASSWORD?: string
  readonly VITE_NAVER_MAPS_KEY_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
