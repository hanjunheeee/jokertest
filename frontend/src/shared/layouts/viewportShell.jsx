import { Outlet } from "react-router-dom";
import { VIEWPORT_BANNER_ASSETS } from "@/shared/layouts/constants/viewportBannerAssets";
import {
    GAME_VIEWPORT_MAX_WIDTH_PX,
    GAME_VIEWPORT_MAX_WIDTH_VAR,
    VIEWPORT_SHELL_COLUMN_GAP_PX,
    VIEWPORT_SHELL_COLUMN_GAP_VAR,
} from "@/shared/layouts/constants/viewportLayout"
import PublicAsset from "@/shared/ui/PublicAsset";

// 게임 화면을 가운데에 두고, 좌우 배너 영역을 함께 배치하는 공통 레이아웃입니다.
export default function ViewportShell() {
    return (
    <div
      className="viewport-shell"
      style={{
        // JS 상수 값을 CSS 변수로 넘겨서 index.css의 레이아웃 계산에서 사용합니다.
        [GAME_VIEWPORT_MAX_WIDTH_VAR]: `${GAME_VIEWPORT_MAX_WIDTH_PX}px`,
        [VIEWPORT_SHELL_COLUMN_GAP_VAR]: `${VIEWPORT_SHELL_COLUMN_GAP_PX}px`,
      }}
    >
      {/* 왼쪽 배너 이미지 영역입니다. 실제 이미지 경로는 constants 파일에서 관리합니다. */}
      <aside className="viewport-shell__banner viewport-shell__banner--left" aria-label="좌측 배너 영역">
        <PublicAsset src={VIEWPORT_BANNER_ASSETS.left} alt="" className="viewport-shell__banner-image" />
      </aside>

      {/* 현재 라우트에 매칭된 페이지가 이 위치에 렌더링됩니다. */}
      <main className="viewport-shell__game">
        <Outlet />
      </main>

      {/* 오른쪽 배너 이미지 영역입니다. */}
      <aside className="viewport-shell__banner viewport-shell__banner--right" aria-label="우측 배너 영역">
        <PublicAsset src={VIEWPORT_BANNER_ASSETS.right} alt="" className="viewport-shell__banner-image" />
      </aside>
    </div>
  )
}
