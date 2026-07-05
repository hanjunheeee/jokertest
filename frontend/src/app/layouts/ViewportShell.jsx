/**
 * 앱 전역 뷰포트 레이아웃 — 모든 라우트를 감싸는 게임 화면 셸
 * 넓은 화면: 가운데 게임 영역(max-width) + 좌·우 검은 배너 슬롯
 * 좁은 화면: 게임 영역이 전체 너비(배너 슬롯 폭 0)
 *
 * 설정값은 app/constants/viewportLayout.js, 스타일은 app/index.css 참고
 */
// Outlet은 React Router가 제공하는 컴포넌트로, "현재 주소에 맞는 자식 라우트가
// 렌더링될 자리"를 표시합니다. 즉 이 ViewportShell(공통 레이아웃) 안에서
// <Outlet />이 있는 위치에 routes/index.jsx가 매칭한 페이지(HomePage, LoginPage 등)가 끼워집니다.
import { Outlet } from "react-router-dom"
import { VIEWPORT_BANNER_ASSETS } from "@/app/constants/viewportBannerAssets.js"
import {
  GAME_VIEWPORT_MAX_WIDTH_PX,
  GAME_VIEWPORT_MAX_WIDTH_VAR,
  VIEWPORT_SHELL_COLUMN_GAP_PX,
  VIEWPORT_SHELL_COLUMN_GAP_VAR,
} from "@/app/constants/viewportLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

/** 좌·우 배너 슬롯 + 가운데 게임 영역에 하위 페이지(Outlet) 렌더 */
export default function ViewportShell() {
  return (
    <div
      className="viewport-shell"
      style={{
        [GAME_VIEWPORT_MAX_WIDTH_VAR]: `${GAME_VIEWPORT_MAX_WIDTH_PX}px`,
        [VIEWPORT_SHELL_COLUMN_GAP_VAR]: `${VIEWPORT_SHELL_COLUMN_GAP_PX}px`,
      }}
    >
      <aside
        className="viewport-shell__banner viewport-shell__banner--left"
        aria-label="좌측 배너 영역"
      >
        <PublicAsset
          src={VIEWPORT_BANNER_ASSETS.left}
          alt=""
          className="viewport-shell__banner-image"
        />
      </aside>
      <main className="viewport-shell__game">
        {/* 실제 페이지 컴포넌트가 렌더링되는 위치 */}
        <Outlet />
      </main>
      <aside
        className="viewport-shell__banner viewport-shell__banner--right"
        aria-label="우측 배너 영역"
      >
        <PublicAsset
          src={VIEWPORT_BANNER_ASSETS.right}
          alt=""
          className="viewport-shell__banner-image"
        />
      </aside>
    </div>
  )
}
