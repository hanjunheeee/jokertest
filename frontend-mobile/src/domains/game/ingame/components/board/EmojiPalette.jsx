// 이모티콘 팔레트: 화면 가운데 8칸 둥근 판, 고르면 닫고 보냄 (body로 portal)
// Board가 씀 (보내기는 데스크톱 useInGameEmojiSend, 칸 자리·틀 그림은 데스크톱과 같음)
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { useInGameEmojiSend } from "@/domains/game/ingame/hooks/useInGameEmojiSend.js"
import { findInGameEmoticonItem } from "@/domains/game/ingame/utils/findInGameEmoticonItem.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { BACKDROP_CLASS, SHEET_TRANSITION } from "./sheetStyle.js"

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

// 칸 하나 22% → 판이 최소 200px이면 누름 자리 44px 이상
const WRAP_CLASS =
    "fixed left-1/2 top-1/2 z-[61] w-[min(18rem,80vw)] -translate-x-1/2 -translate-y-1/2 land:w-[min(16rem,70svh)]"

const SLOT_CLASS =
    "absolute z-10 flex h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-transparent bg-black/30 p-[2%] active:border-[#e8c878] active:bg-black/50 disabled:cursor-default disabled:opacity-40"

// 열렸을 때만 그림, 뒤판 누름·고르면 닫힘 (보내기 실패는 팔레트가 이미 닫혀 조용히 넘김)
export default function EmojiPalette({ open, slots = [], onClose }) {
    const { send } = useInGameEmojiSend()

    const pick = (itemId) => {
        onClose()
        Promise.resolve(send(itemId)).catch(() => {})
    }

    return createPortal(
        <AnimatePresence>
            {open ? (
                <>
                    <motion.button
                        key="backdrop"
                        type="button"
                        aria-label="이모티콘 팔레트 닫기"
                        className={BACKDROP_CLASS}
                        data-sfx-kind="ui-cancel"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={SHEET_TRANSITION}
                        onClick={onClose}
                    />
                    <div role="group" aria-label={PALETTE_LABEL} className={WRAP_CLASS} style={{ aspectRatio: ASPECT_RATIO }} {...{ [PALETTE_ATTR]: "true" }}>
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
                                    className={SLOT_CLASS}
                                    onClick={() => item && pick(item.id)}
                                >
                                    {item ? <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" /> : null}
                                </button>
                            )
                        })}
                    </div>
                </>
            ) : null}
        </AnimatePresence>,
        document.body,
    )
}
