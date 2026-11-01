// 옆 창 머리: 제목 판 그림 위 제목과 그 아래 설명 한 줄
// 설정 창 내용(SettingPanelContent)·전적 목록 내용이 사용
import { PANEL_ASSETS } from "../../constants/controls/ingameSidePanelAssets.js"
import {
  HEADER_PLATE_CLASS,
  HEADER_SUBTITLE_CLASS,
  HEADER_TITLE_CLASS,
  HEADER_WRAP_CLASS,
} from "../../constants/controls/ingameSidePanelLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 제목은 판 그림 위에 겹쳐 그림
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
