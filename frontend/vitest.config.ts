import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 프론트 단위/컴포넌트 테스트 — jsdom 환경 + testing-library. (tailwind 플러그인은 테스트에 불필요)
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
