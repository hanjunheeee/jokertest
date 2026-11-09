// 시험 전용 관리자 화면 설정, 원래 frontend/vite.admin.config.js 그대로 + 따로 쓰는 캐시 폴더·빌드 폴더
// scripts/serve-front.js admin이 씀 (늘 빌드본 → 개발 서버 5175·frontend/dist-admin과 안 부딪힘)
import { fileURLToPath, URL } from 'node:url'
import base from '../../frontend/vite.admin.config.js'

// vite를 여기서 안 불러옴 (e2e 폴더엔 vite가 없음), 겹치는 칸만 직접 덮음
export default {
  ...base,
  cacheDir: 'node_modules/.vite-e2e-admin',
  build: {
    ...(base.build ?? {}),
    outDir: fileURLToPath(new URL('../.runtime/front/admin', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 100000,
  },
  clearScreen: false,
}
