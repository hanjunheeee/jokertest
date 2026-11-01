import { PANEL_ASSETS } from "../../constants/controls/ingameSidePanelAssets.js"
import {
  HEADER_PLATE_CLASS,
  HEADER_SUBTITLE_CLASS,
  HEADER_TITLE_CLASS,
  HEADER_WRAP_CLASS,
} from "../../constants/controls/ingameSidePanelLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function SidePanelHeader({ title, subtitle }) {
  return (
    <header className={HEADER_WRAP_CLASS}>
      <div className="relative w-full">
        <PublicAsset
          src={PANEL_ASSETS.headerPlate}
          alt=""
          className={HEADER_PLATE_CLASS}
        />
        <h2 className={HEADER_TITLE_CLASS}>{title}</h2>
      </div>
      <p className={HEADER_SUBTITLE_CLASS}>{subtitle}</p>
    </header>
  )
}
