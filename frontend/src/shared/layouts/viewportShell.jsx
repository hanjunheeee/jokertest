import { Outlet } from "react-router-dom";
import { VIEWPORT_BANNER_ASSETS } from "@/shared/layouts/constants/viewportBannerAssets";
import {
    GAME_VIEWPORT_MAX_WIDTH_PX,
    GAME_VIEWPORT_MAX_WIDTH_VAR,
    SHELL_COLUMN_GAP_PX,
    SHELL_COLUMN_GAP_VAR,
} from "@/shared/layouts/constants/viewportLayout"
import PublicAsset from "@/shared/ui/PublicAsset";

export default function ViewportShell() {
    return (
    <div
      className="viewport-shell"
      style={{
        [GAME_VIEWPORT_MAX_WIDTH_VAR]: `${GAME_VIEWPORT_MAX_WIDTH_PX}px`,
        [SHELL_COLUMN_GAP_VAR]: `${SHELL_COLUMN_GAP_PX}px`,
      }}
    >
      <aside className="viewport-shell__banner viewport-shell__banner--left" aria-label="좌측 배너 영역">
        <PublicAsset src={VIEWPORT_BANNER_ASSETS.left} alt="" className="viewport-shell__banner-image" />
      </aside>

      <main className="viewport-shell__game">
        <Outlet />
      </main>

      <aside className="viewport-shell__banner viewport-shell__banner--right" aria-label="우측 배너 영역">
        <PublicAsset src={VIEWPORT_BANNER_ASSETS.right} alt="" className="viewport-shell__banner-image" />
      </aside>
    </div>
  )
}
