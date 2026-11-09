// 관리자 화면 빌드 설정 파일, 입구 admin.html → 결과 dist-admin/ (플레이어 vite.config.js·dist/와 따로)
// npm run dev:admin(개발 5175, /admin-api → 4000) · npm run build:admin이 씀
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const ADMIN_PAGE = '/admin.html'

// 화면 주소(/members 등)로 바로 들어와도 admin.html을 줌 (기본은 플레이어 index.html을 줘서 막음)
const isPageRequest = (req) => req.method === 'GET'
  && (req.headers.accept ?? '').includes('text/html')
  && !req.url.startsWith('/admin-api')
  && !req.url.startsWith('/@')
  && !/\.[a-z0-9]+(\?|$)/i.test(req.url)

const servePageFallback = (req, _res, next) => {
  if (isPageRequest(req)) req.url = ADMIN_PAGE
  next()
}

const adminPageFallback = () => ({
  name: 'mmc-admin-page-fallback',
  configureServer: (server) => { server.middlewares.use(servePageFallback) },
  configurePreviewServer: (server) => { server.middlewares.use(servePageFallback) },
})

// 개발 때 관리자 서버 주소 (기본 내 컴퓨터 4000)
const ADMIN_API_TARGET = process.env.ADMIN_API_TARGET || 'http://localhost:4000'

export default defineConfig({
  plugins: [react(), tailwindcss(), adminPageFallback()],
  // public/(게임 그림·소리)은 관리자 빌드에 안 넣음
  publicDir: false,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: { '/admin-api': { target: ADMIN_API_TARGET } },
  },
  preview: {
    port: 5175,
    strictPort: true,
    proxy: { '/admin-api': { target: ADMIN_API_TARGET } },
  },
  build: {
    outDir: 'dist-admin',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./admin.html', import.meta.url)) },
  },
})
