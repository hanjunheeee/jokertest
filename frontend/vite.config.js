import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from "node:url"
import tailwindcss from '@tailwindcss/vite'
// 빌드 버전을 화면에 넣고 version.json으로 내보냄 (새 버전 안내용)
import { appVersionPlugin } from './scripts/appVersionPlugin.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss(), appVersionPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});