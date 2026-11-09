// 시험 전용 데스크톱 화면 설정, 원래 frontend/vite.config.js 그대로 + 포트 5273·따로 쓰는 캐시 폴더
// playwright.config.js webServer가 frontend 폴더에서 vite --config로 씀 (개발 서버 5173과 캐시가 안 부딪히게)
import base from '../../frontend/vite.config.js'

// vite를 여기서 안 불러옴 (e2e 폴더엔 vite가 없음), 겹치는 칸만 직접 덮음
export default {
  ...base,
  cacheDir: 'node_modules/.vite-e2e',
  server: { ...(base.server ?? {}), port: 5273, strictPort: true, open: false },
  clearScreen: false,
}
