// 이모지 팔레트: 내 카드 우클릭 때 뜨는 8칸 둥근 판, 고르면 이모지 보냄
// 플레이어 보드(InGamePlayerBoard)가 사용, 보내기는 useInGameEmojiSend
import { useEffect, useRef } from "react"

import PublicAsset from "@/shared/ui/PublicAsset"

import { useInGameEmojiSend } from "../../hooks/useInGameEmojiSend.js"
import { findInGameEmoticonItem } from "../../utils/findInGameEmoticonItem.js"

// 틀 그림·시험이 찾는 표시·읽어 주는 이름
export const FRAME_SRC = "/frame/emoji/palette-frame.png"

export const INGAME_EMOJI_PALETTE_ATTR = "data-ingame-emoji-palette"

export const PALETTE_LABEL = "이모티콘 팔레트"

// 칸 수와 틀 그림 원본 크기 (비율 맞추기용, 시험도 봄)
export const INGAME_EMOJI_PALETTE_SLOT_COUNT = 8

export const INGAME_EMOJI_PALETTE_FRAME_WIDTH = 769
export const INGAME_EMOJI_PALETTE_FRAME_HEIGHT = 738
export const ASPECT_RATIO =
  `${INGAME_EMOJI_PALETTE_FRAME_WIDTH} / ${INGAME_EMOJI_PALETTE_FRAME_HEIGHT}`

// 칸 자리: 12시부터 시계 방향 8곳
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

// 판·틀·칸 모양 (빈 칸은 흐리고 못 누름)
const PALETTE_WRAP_CLASS =
  "absolute left-1/2 top-1/2 z-40 w-[min(13rem,72vw)] -translate-x-1/2 -translate-y-1/2"

const FRAME_IMG_CLASS =
  "pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none object-fill"

const SLOT_BUTTON_CLASS =
  "absolute z-10 flex h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-transparent bg-black/30 p-[2%]"

const SLOT_FILLED_CLASS = "cursor-pointer hover:border-[#e8c878] hover:bg-black/50"

const SLOT_EMPTY_CLASS = "cursor-default opacity-40"

// 고르면 보드에 알려 닫고 보내기, 바깥 누름·Esc면 닫힘
export default function InGameEmojiPalette({ slots = [], onSelect, onClose }) {
  const { send } = useInGameEmojiSend()
  const rootRef = useRef(null)
  // 닫기 함수는 ref로 들고 있어 바깥 누름 감시를 한 번만 붙임
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // 판 바깥 누름·Esc 키 감시 (판 안쪽 누름은 무시)
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

  // 고르면 바로 닫고 보내기, 보내기 실패는 팔레트가 이미 닫혀 조용히 넘김
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
      aria-label={PALETTE_LABEL}
      className={PALETTE_WRAP_CLASS}
      style={{ aspectRatio: ASPECT_RATIO }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      {...{ [INGAME_EMOJI_PALETTE_ATTR]: "true" }}
    >
      <PublicAsset
        src={FRAME_SRC}
        alt=""
        className={FRAME_IMG_CLASS}
        aria-hidden="true"
      />
      {Array.from({ length: INGAME_EMOJI_PALETTE_SLOT_COUNT }, (_, index) => {
        // 칸마다 저장된 이모지 찾기, 없으면 빈 칸
        const item = findInGameEmoticonItem(slots[index])
        const position = SLOT_POSITIONS[index]
        // 우클릭 떼기나 좌클릭으로 고름
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
