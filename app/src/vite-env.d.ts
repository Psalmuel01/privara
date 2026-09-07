/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVARA_RELAYER_URL?: string;
  readonly VITE_STACKS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
