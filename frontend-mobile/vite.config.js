// 모바일 앱 빌드 설정: 로직은 데스크톱 src(@), 화면은 모바일 src(@m)
// public 그림은 데스크톱 것을 그대로 씀 (복사 안 함)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const at = (p) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 그림·소리·영상 304MB를 두 벌로 안 두기
  publicDir: at('../frontend/public'),
  resolve: {
    alias: {
      // 데스크톱 로직. 데스크톱 파일 안의 @/ import도 같은 곳으로 풀림
      '@': at('../frontend/src'),
      // 모바일 화면
      '@m': at('./src'),
    },
    // 바깥 폴더 파일의 import가 frontend/node_modules로 풀리면 React·스토어가 두 벌 → 훅 오류
    dedupe: ['react', 'react-dom', 'react-router-dom', 'zustand', 'socket.io-client', 'framer-motion'],
  },
  server: {
    port: 5174,
    strictPort: true,
    // 저장소 루트까지 열어야 dev 서버가 ../frontend/src를 읽음
    fs: { allow: [at('..')] },
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
})
