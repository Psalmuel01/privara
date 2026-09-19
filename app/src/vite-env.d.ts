/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVARA_NETWORK?: string;
  readonly VITE_PRIVARA_RELAYER_URL?: string;
  readonly VITE_STACKS_API_URL?: string;
  readonly VITE_PRIVARA_FALLBACK_REGISTRY?: string;
  readonly VITE_PRIVARA_FALLBACK_ROUTER?: string;
  readonly VITE_PRIVARA_FALLBACK_ASSET?: string;
  readonly VITE_PRIVARA_STX_ROUTER?: string;
  readonly VITE_PRIVARA_USDCX_ROUTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
