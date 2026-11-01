// 모든 화면을 감싸는 틀 (가운데 게임 화면 + 좌우 배너)
// app/routes/index.jsx가 가장 바깥 경로로 씀
import { Outlet } from "react-router-dom";
import { VIEWPORT_BANNER_ASSETS } from "@/shared/layouts/constants/viewportBannerAssets";
import {
    GAME_VIEWPORT_MAX_WIDTH_PX,
    GAME_VIEWPORT_MAX_WIDTH_VAR,
    SHELL_COLUMN_GAP_PX,
    SHELL_COLUMN_GAP_VAR,
    SIDE_BANNER_IMAGES_VISIBLE,
} from "@/shared/layouts/constants/viewportLayout"
import PublicAsset from "@/shared/ui/PublicAsset";

// 게임 화면 최대 폭·배너 간격을 css 변수로 넘겨 index.css가 배치함
// 배너 그림을 끄면 칸은 남기고 그림만 빼서 게임 열 폭이 안 바뀜
export default function ViewportShell() {
    return (
    <div
      className={
        SIDE_BANNER_IMAGES_VISIBLE
          ? "viewport-shell"
          : "viewport-shell viewport-shell--banner-images-hidden"
      }
      style={{
        [GAME_VIEWPORT_MAX_WIDTH_VAR]: `${GAME_VIEWPORT_MAX_WIDTH_PX}px`,
        [SHELL_COLUMN_GAP_VAR]: `${SHELL_COLUMN_GAP_PX}px`,
      }}
    >
      <aside className="viewport-shell__banner viewport-shell__banner--left" aria-label="좌측 배너 영역">
        {SIDE_BANNER_IMAGES_VISIBLE ? (
          <PublicAsset src={VIEWPORT_BANNER_ASSETS.left} alt="" className="viewport-shell__banner-image" />
        ) : null}
      </aside>

      <main className="viewport-shell__game">
        <Outlet />
      </main>

      <aside className="viewport-shell__banner viewport-shell__banner--right" aria-label="우측 배너 영역">
        {SIDE_BANNER_IMAGES_VISIBLE ? (
          <PublicAsset src={VIEWPORT_BANNER_ASSETS.right} alt="" className="viewport-shell__banner-image" />
        ) : null}
      </aside>
    </div>
  )
}
