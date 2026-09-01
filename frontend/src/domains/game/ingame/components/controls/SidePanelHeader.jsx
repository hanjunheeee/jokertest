/**
 * 인게임 좌측 슬라이드 패널 — 탑레벨 프레임 헤더 (타이틀 + 부제)
 */
import { INGAME_SIDE_PANEL_ASSETS } from "../../constants/controls/ingameSidePanelAssets.js"
import {
  INGAME_SIDE_PANEL_HEADER_PLATE_CLASS,
  INGAME_SIDE_PANEL_HEADER_SUBTITLE_CLASS,
  INGAME_SIDE_PANEL_HEADER_TITLE_CLASS,
  INGAME_SIDE_PANEL_HEADER_WRAP_CLASS,
} from "../../constants/controls/ingameSidePanelLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function SidePanelHeader({ title, subtitle }) {
  return (
    <header className={INGAME_SIDE_PANEL_HEADER_WRAP_CLASS}>
      <div className="relative w-full">
        <PublicAsset
          src={INGAME_SIDE_PANEL_ASSETS.headerPlate}
          alt=""
          className={INGAME_SIDE_PANEL_HEADER_PLATE_CLASS}
        />
        <h2 className={INGAME_SIDE_PANEL_HEADER_TITLE_CLASS}>{title}</h2>
      </div>
      <p className={INGAME_SIDE_PANEL_HEADER_SUBTITLE_CLASS}>{subtitle}</p>
    </header>
  )
}
