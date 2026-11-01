// 이모티콘 팔레트: 8칸 둥근 판, 고르면 닫고 보냄 (작은 카드 대신 화면 가운데, body로 portal)
// Board가 씀 (보내기는 데스크톱 useInGameEmojiSend, 칸 자리·틀 그림·크기는 데스크톱과 같음)
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { useInGameEmojiSend } from "@/domains/game/ingame/hooks/useInGameEmojiSend.js"
import { findInGameEmoticonItem } from "@/domains/game/ingame/utils/findInGameEmoticonItem.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const FRAME_SRC = "/frame/emoji/palette-frame.png"
const PALETTE_ATTR = "data-ingame-emoji-palette"
const PALETTE_LABEL = "이모티콘 팔레트"
const SLOT_COUNT = 8
const ASPECT_RATIO = "769 / 738"

// 칸 자리: 12시부터 시계 방향 8곳
const SLOT_POSITIONS = [
    { top: "12%", left: "50%" }, { top: "23%", left: "77%" }, { top: "50%", left: "88%" }, { top: "77%", left: "77%" },
    { top: "88%", left: "50%" }, { top: "77%", left: "23%" }, { top: "50%", left: "12%" }, { top: "23%", left: "23%" },
]

// 바깥 누름 받는 투명 판 (데스크톱은 어둡게 안 함), 데스크톱처럼 누르는 순간(pointerdown) 닫음
// → 길게 누르기 뒤 손 뗄 때 오는 click으로 바로 닫히지 않음
const CATCHER_CLASS = "fixed inset-0 z-[60] cursor-default border-0 bg-transparent p-0"

// 판 폭은 데스크톱 min(13rem,72vw) → 칸 22%가 45px 이상
const WRAP_CLASS =
    "fixed left-1/2 top-1/2 z-[61] w-[min(13rem,72vw)] -translate-x-1/2 -translate-y-1/2"

// 데스크톱 칸 모양에서 hover만 active로 바꿈
const SLOT_CLASS =
    "absolute z-10 flex h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-transparent bg-black/30 p-[2%]"
const SLOT_FILLED_CLASS = "cursor-pointer active:border-[#e8c878] active:bg-black/50"
const SLOT_EMPTY_CLASS = "cursor-default opacity-40"

// 열린 동안 Esc로 닫기 (데스크톱과 같음)
function useEscape(open, onClose) {
    useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
            if (event.key === "Escape") onClose()
        }
        document.addEventListener("keydown", onKeyDown)
        return () => document.removeEventListener("keydown", onKeyDown)
    }, [open, onClose])
}

// 열렸을 때만 그림, 바깥 누름·Esc·고르면 닫힘 (보내기 실패는 팔레트가 이미 닫혀 조용히 넘김)
export default function EmojiPalette({ open, slots = [], onClose }) {
    const { send } = useInGameEmojiSend()
    useEscape(open, onClose)

    const pick = (itemId) => {
        onClose()
        Promise.resolve(send(itemId)).catch(() => {})
    }

    if (!open) return null

    return createPortal(
        <>
            <button type="button" aria-label="이모티콘 팔레트 닫기" className={CATCHER_CLASS} onPointerDown={onClose} />
            <div
                role="group"
                aria-label={PALETTE_LABEL}
                className={WRAP_CLASS}
                style={{ aspectRatio: ASPECT_RATIO }}
                onContextMenu={(event) => event.preventDefault()}
                {...{ [PALETTE_ATTR]: "true" }}
            >
                <PublicAsset src={FRAME_SRC} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none object-fill" />
                {SLOT_POSITIONS.slice(0, SLOT_COUNT).map((position, index) => {
                    const item = findInGameEmoticonItem(slots[index])
                    return (
                        <button
                            key={`palette-slot-${index}`}
                            type="button"
                            aria-label={item ? `${item.name} 보내기` : `${index + 1}번 칸 비어 있음`}
                            disabled={!item}
                            style={position}
                            className={`${SLOT_CLASS} ${item ? SLOT_FILLED_CLASS : SLOT_EMPTY_CLASS}`}
                            onClick={() => item && pick(item.id)}
                        >
                            {item ? <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" /> : null}
                        </button>
                    )
                })}
            </div>
        </>,
        document.body,
    )
}
