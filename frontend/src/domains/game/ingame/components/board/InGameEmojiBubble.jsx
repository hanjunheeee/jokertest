import PublicAsset from "@/shared/ui/PublicAsset"

import { findInGameEmoticonItem } from "../../utils/findInGameEmoticonItem.js"

export const INGAME_EMOJI_BUBBLE_SRC = "/frame/emoji/speech-bubble.png"

export const INGAME_EMOJI_BUBBLE_ATTR = "data-ingame-emoji-bubble"

const BUBBLE_WRAP_CLASS =
  "pointer-events-none absolute bottom-full left-1/2 z-30 w-[min(4.5rem,42%)] -translate-x-1/2 -translate-y-1"

const FRAME_IMG_CLASS = "block h-auto w-full select-none"

const BUBBLE_ICON_WRAP_CLASS = "absolute inset-0 flex items-center justify-center p-[22%] pb-[32%]"

export default function InGameEmojiBubble({ itemId }) {
  const item = findInGameEmoticonItem(itemId)
  if (!item) return null

  return (
    <div className={BUBBLE_WRAP_CLASS} {...{ [INGAME_EMOJI_BUBBLE_ATTR]: item.id }}>
      <PublicAsset src={INGAME_EMOJI_BUBBLE_SRC} alt="" className={FRAME_IMG_CLASS} aria-hidden="true" />
      <span className={BUBBLE_ICON_WRAP_CLASS}>
        <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
      </span>
    </div>
  )
}
