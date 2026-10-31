import { useEffect, useRef } from "react"

import PublicAsset from "@/shared/ui/PublicAsset"

import { useInGameEmojiSend } from "../../hooks/useInGameEmojiSend.js"
import { findInGameEmoticonItem } from "../../utils/findInGameEmoticonItem.js"

export const INGAME_EMOJI_PALETTE_FRAME_SRC = "/frame/emoji/palette-frame.png"

export const INGAME_EMOJI_PALETTE_ATTR = "data-ingame-emoji-palette"

export const INGAME_EMOJI_PALETTE_LABEL = "이모티콘 팔레트"

export const INGAME_EMOJI_PALETTE_SLOT_COUNT = 8

export const INGAME_EMOJI_PALETTE_FRAME_WIDTH = 769
export const INGAME_EMOJI_PALETTE_FRAME_HEIGHT = 738
export const INGAME_EMOJI_PALETTE_ASPECT_RATIO =
  `${INGAME_EMOJI_PALETTE_FRAME_WIDTH} / ${INGAME_EMOJI_PALETTE_FRAME_HEIGHT}`

const SLOT_POSITIONS = [
  { top: "12%", left: "50%" },
  { top: "23%", left: "77%" },
  { top: "50%", left: "88%" },
  { top: "77%", left: "77%" },
  { top: "88%", left: "50%" },
  { top: "77%", left: "23%" },
  { top: "50%", left: "12%" },
  { top: "23%", left: "23%" },
]

const PALETTE_WRAP_CLASS =
  "absolute left-1/2 top-1/2 z-40 w-[min(13rem,72vw)] -translate-x-1/2 -translate-y-1/2"

const PALETTE_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none object-fill"

const SLOT_BUTTON_CLASS =
  "absolute z-10 flex h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-transparent bg-black/30 p-[2%]"

const SLOT_FILLED_CLASS = "cursor-pointer hover:border-[#e8c878] hover:bg-black/50"

const SLOT_EMPTY_CLASS = "cursor-default opacity-40"

export default function InGameEmojiPalette({ slots = [], onSelect, onClose }) {
  const { send } = useInGameEmojiSend()
  const rootRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const close = () => {
      if (typeof onCloseRef.current === "function") onCloseRef.current()
    }
    const handleMouseDown = (event) => {
      const node = rootRef.current
      if (node && node.contains(event.target)) return
      close()
    }
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return
      close()
    }
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  const dispatch = (event, itemId) => {
    event.stopPropagation()
    event.preventDefault()
    if (typeof onSelect === "function") onSelect(itemId)
    Promise.resolve(send(itemId)).catch(() => {})
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={INGAME_EMOJI_PALETTE_LABEL}
      className={PALETTE_WRAP_CLASS}
      style={{ aspectRatio: INGAME_EMOJI_PALETTE_ASPECT_RATIO }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      {...{ [INGAME_EMOJI_PALETTE_ATTR]: "true" }}
    >
      <PublicAsset
        src={INGAME_EMOJI_PALETTE_FRAME_SRC}
        alt=""
        className={PALETTE_FRAME_IMAGE_CLASS}
        aria-hidden="true"
      />
      {Array.from({ length: INGAME_EMOJI_PALETTE_SLOT_COUNT }, (_, index) => {
        const item = findInGameEmoticonItem(slots[index])
        const position = SLOT_POSITIONS[index]
        return (
          <button
            key={`ingame-emoji-slot-${index}`}
            type="button"
            aria-label={item ? `${item.name} 보내기` : `${index + 1}번 칸 비어 있음`}
            disabled={!item}
            style={{ top: position.top, left: position.left }}
            className={`${SLOT_BUTTON_CLASS} ${item ? SLOT_FILLED_CLASS : SLOT_EMPTY_CLASS}`}
            onMouseUp={(event) => {
              if (event.button !== 2) return
              if (!item) return
              dispatch(event, item.id)
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (event.button !== 0) return
              if (!item) return
              dispatch(event, item.id)
            }}
          >
            {item
              ? <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
              : null}
          </button>
        )
      })}
    </div>
  )
}
