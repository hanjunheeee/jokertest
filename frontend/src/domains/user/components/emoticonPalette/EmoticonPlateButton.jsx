// 보유 이모티콘 판 하나 (누르면 고른 칸에 넣음, 마우스 따라 이름표)
// EmoticonInventoryGrid가 씀
import { useState } from "react"

import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  PLATE_BTN_CLASS,
  PLATE_ICON_CLASS,
  PLATE_ICON_WRAP_CLASS,
  PLATE_IMG_CLASS,
  PLATE_INNER_CLASS,
  PLATE_UNOWNED_BTN_CLASS,
  PLATE_UNOWNED_INNER_CLASS,
  PLATE_UNOWNED_OVERLAY_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import EmoticonPlateNameplate from "@/domains/user/components/emoticonPalette/EmoticonPlateNameplate.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 미보유·잠김이면 못 누르고 이름표도 안 띄움
export default function EmoticonPlateButton({ item, owned = true, disabled, onAssign }) {
  const [cursor, setCursor] = useState(null)
  const isInteractive = owned && !disabled

  // 마우스 위치 기억 (이름표 자리)
  const handlePointerMove = (event) => {
    if (!isInteractive) return
    setCursor({ x: event.clientX, y: event.clientY })
  }

  const handlePointerLeave = () => {
    setCursor(null)
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || !owned}
        onClick={() => onAssign(item.id)}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        aria-label={owned ? `${item.name} 팔레트에 넣기` : `${item.name} (미보유)`}
        className={`${PLATE_BTN_CLASS} ${owned ? "" : PLATE_UNOWNED_BTN_CLASS}`.trim()}
      >
        <span
          className={`${PLATE_INNER_CLASS} ${owned ? "" : PLATE_UNOWNED_INNER_CLASS}`.trim()}
        >
          <PublicAsset src={EMOTICON_PALETTE_ASSETS.plate} alt="" className={PLATE_IMG_CLASS} />
          {!owned ? <span aria-hidden="true" className={PLATE_UNOWNED_OVERLAY_CLASS} /> : null}
          <span className={PLATE_ICON_WRAP_CLASS}>
            <PublicAsset src={item.icon} alt={item.name} className={PLATE_ICON_CLASS} />
          </span>
        </span>
      </button>

      {cursor && isInteractive ? (
        <EmoticonPlateNameplate name={item.name} x={cursor.x} y={cursor.y} />
      ) : null}
    </>
  )
}
