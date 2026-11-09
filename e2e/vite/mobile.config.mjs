// 시험 전용 모바일 화면 설정, 원래 frontend-mobile/vite.config.js 그대로 + 포트 5274·따로 쓰는 캐시 폴더·빌드 폴더
// scripts/serve-front.js가 씀 (E2E_FRONT=dev면 개발 서버, build면 빌드해서 작은 정적 서버로 — 개발 서버 5174·frontend-mobile/dist와 안 부딪히게)
import { fileURLToPath, URL } from 'node:url'
import base from '../../frontend-mobile/vite.config.js'

// vite를 여기서 안 불러옴 (e2e 폴더엔 vite가 없음), 겹치는 칸만 직접 덮음
export default {
  ...base,
  cacheDir: 'node_modules/.vite-e2e',
  server: { ...(base.server ?? {}), port: 5274, strictPort: true, open: false },
  preview: { ...(base.preview ?? {}), port: 5274, strictPort: true, open: false },
  // 빌드는 e2e/.runtime/front/mobile 에 (public 그림·소리 200MB는 안 베낌 → 정적 서버가 public 폴더에서 바로 줌)
  build: {
    ...(base.build ?? {}),
    outDir: fileURLToPath(new URL('../.runtime/front/mobile', import.meta.url)),
    emptyOutDir: true,
    copyPublicDir: false,
    // 큰 조각 경고는 시험 출력만 어지럽힘 (운영 빌드 설정은 원래 파일 그대로)
    chunkSizeWarningLimit: 100000,
  },
  clearScreen: false,
}
