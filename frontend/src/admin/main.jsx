// 관리자 화면 시작 파일, 관리자 전용 css를 넣고 AdminApp을 그림
// admin.html의 script가 부름 (플레이어 index.html → src/main.jsx와 따로)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/admin/app/index.css'
import AdminApp from '@/admin/app/AdminApp'

createRoot(document.getElementById('admin-root')).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
)
