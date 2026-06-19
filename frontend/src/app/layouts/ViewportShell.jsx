/**
 * 앱 전역 뷰포트 레이아웃 — 모든 라우트를 감싸는 게임 화면 셸
 * 넓은 화면: 가운데 게임 영역(max-width) + 좌·우 검은 배너 슬롯
 * 좁은 화면: 게임 영역이 전체 너비(배너 슬롯 폭 0)
 *
 * 설정값은 app/constants/viewportLayout.js, 스타일은 app/index.css 참고
 */
import { Outlet } from "react-router-dom"
import {
  GAME_VIEWPORT_MAX_WIDTH_PX,
  GAME_VIEWPORT_MAX_WIDTH_VAR,
} from "@/app/constants/viewportLayout.js"

/** 좌·우 배너 슬롯 + 가운데 게임 영역에 하위 페이지(Outlet) 렌더 */
export default function ViewportShell() {
  return (
    <div
      className="viewport-shell"
      style={{ [GAME_VIEWPORT_MAX_WIDTH_VAR]: `${GAME_VIEWPORT_MAX_WIDTH_PX}px` }}
    >
      <aside
        className="viewport-shell__banner viewport-shell__banner--left"
        aria-label="좌측 배너 영역"
      />
      <main className="viewport-shell__game">
        <Outlet />
      </main>
      <aside
        className="viewport-shell__banner viewport-shell__banner--right"
        aria-label="우측 배너 영역"
      />
    </div>
  )
}
