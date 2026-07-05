/**
 * React 앱 부트스트랩 지점(entry point).
 *
 * 브라우저가 이 파일을 가장 먼저 실행해서 React 앱을 실제 HTML 화면에 "심습니다".
 * 즉 모든 컴포넌트 트리(App 이하)는 이 파일의 실행에서부터 시작됩니다.
 *
 * StrictMode는 개발 환경에서 effect 중복 실행을 유도해 부작용 문제를 빨리 드러냅니다.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app/index.css'
import App from './app/App'

// createRoot(DOM엘리먼트)는 index.html의 <div id="root">를 React가 관리할 영역으로 지정합니다.
// 이렇게 만든 root에 .render(...)로 컴포넌트를 그려 넣으면, 이후로는 React가 이 영역의
// DOM 갱신을 전부 책임집니다(state가 바뀔 때마다 자동으로 다시 그려줌).
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
