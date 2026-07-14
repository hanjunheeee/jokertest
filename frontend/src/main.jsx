import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client'
import '@/app/index.css'
import App from '@/app/App'
import { handleAuthUnauthorized } from '@/domains/auth/api/unauthorized'
import { setUnauthorizedHandler } from '@/shared/api/response'

// 401 인증 실패 시 처리 방식은 auth 도메인에서 정의하고, shared API 계층에는 등록만 합니다.
setUnauthorizedHandler(handleAuthUnauthorized)

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>
)
