/**
 * React 앱 부트스트랩 지점.
 *
 * StrictMode는 개발 환경에서 effect 중복 실행을 유도해 부작용 문제를 빨리 드러냅니다.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app/index.css'
import App from './app/App'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
