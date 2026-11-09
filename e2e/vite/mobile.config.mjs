// 시험 전용 모바일 화면 설정, 원래 frontend-mobile/vite.config.js 그대로 + 포트 5274·따로 쓰는 캐시 폴더
// playwright.config.js webServer가 frontend-mobile 폴더에서 vite --config로 씀 (개발 서버 5174와 캐시가 안 부딪히게)
import base from '../../frontend-mobile/vite.config.js'

// vite를 여기서 안 불러옴 (e2e 폴더엔 vite가 없음), 겹치는 칸만 직접 덮음
export default {
  ...base,
  cacheDir: 'node_modules/.vite-e2e',
  server: { ...(base.server ?? {}), port: 5274, strictPort: true, open: false },
  clearScreen: false,
}
