import { useState } from "react"

import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  EMOTICON_PALETTE_PLATE_BTN_CLASS,
  EMOTICON_PALETTE_PLATE_ICON_CLASS,
  EMOTICON_PALETTE_PLATE_ICON_WRAP_CLASS,
  EMOTICON_PALETTE_PLATE_IMG_CLASS,
  EMOTICON_PALETTE_PLATE_INNER_CLASS,
  EMOTICON_PALETTE_PLATE_UNOWNED_BTN_CLASS,
  EMOTICON_PALETTE_PLATE_UNOWNED_INNER_CLASS,
  EMOTICON_PALETTE_PLATE_UNOWNED_OVERLAY_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import EmoticonPlateNameplate from "@/domains/user/components/emoticonPalette/EmoticonPlateNameplate.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function EmoticonPlateButton({ item, owned = true, disabled, onAssign }) {
  const [cursor, setCursor] = useState(null)
  const isInteractive = owned && !disabled

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
        className={`${EMOTICON_PALETTE_PLATE_BTN_CLASS} ${owned ? "" : EMOTICON_PALETTE_PLATE_UNOWNED_BTN_CLASS}`.trim()}
      >
        <span
          className={`${EMOTICON_PALETTE_PLATE_INNER_CLASS} ${owned ? "" : EMOTICON_PALETTE_PLATE_UNOWNED_INNER_CLASS}`.trim()}
        >
          <PublicAsset src={EMOTICON_PALETTE_ASSETS.plate} alt="" className={EMOTICON_PALETTE_PLATE_IMG_CLASS} />
          {!owned ? <span aria-hidden="true" className={EMOTICON_PALETTE_PLATE_UNOWNED_OVERLAY_CLASS} /> : null}
          <span className={EMOTICON_PALETTE_PLATE_ICON_WRAP_CLASS}>
            <PublicAsset src={item.icon} alt={item.name} className={EMOTICON_PALETTE_PLATE_ICON_CLASS} />
          </span>
        </span>
      </button>

      {cursor && isInteractive ? (
        <EmoticonPlateNameplate name={item.name} x={cursor.x} y={cursor.y} />
      ) : null}
    </>
  )
}
