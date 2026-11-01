// 모바일 앱 시작점: 전역 css를 넣고 401 처리 함수를 등록한 뒤 App을 그림
// index.html의 script가 불러옴 (데스크톱 main.jsx와 같은 순서)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@m/app/index.css'
import App from '@m/app/App'
import { handleAuthUnauthorized } from '@/domains/auth/api/unauthorized'
import { setUnauthorizedHandler } from '@/shared/api/response'

// 로그인 풀린 401은 데스크톱과 같은 auth 처리(로그아웃 → /login)로 넘김
setUnauthorizedHandler(handleAuthUnauthorized)

// StrictMode는 개발 때 효과를 두 번 돌려 정리 빠짐을 드러냄
createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>
)
