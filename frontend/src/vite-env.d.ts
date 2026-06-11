/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_WS_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// d3-force는 타입 선언이 없어(JS 패키지) noImplicitAny에서 막힘 — 모듈만 any로 선언.
declare module 'd3-force'
