// 이모티콘 말풍선: 카드 위에 잠깐 뜨는 받은 이모티콘
// CardSlot이 씀, 띄우기·지우기(3초)는 데스크톱 이모티콘 말풍선 스토어가 맡음
import { findInGameEmoticonItem } from "@/domains/game/ingame/utils/findInGameEmoticonItem.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 말풍선 틀 그림·시험이 찾는 표시 (데스크톱과 같은 값)
const BUBBLE_SRC = "/frame/emoji/speech-bubble.png"
const BUBBLE_ATTR = "data-ingame-emoji-bubble"

// 자리·크기는 데스크톱 그대로 (카드 바로 위 가운데, 카드 폭 42%·최대 4.5rem)
const WRAP_CLASS =
    "pointer-events-none absolute bottom-full left-1/2 z-30 w-[min(4.5rem,42%)] -translate-x-1/2 -translate-y-1"

const ICON_WRAP_CLASS = "absolute inset-0 flex items-center justify-center p-[22%] pb-[32%]"

// 목록에 없는 id면 안 그림
export default function EmojiBubble({ itemId }) {
    const item = findInGameEmoticonItem(itemId)
    if (!item) return null

    return (
        <div className={WRAP_CLASS} {...{ [BUBBLE_ATTR]: item.id }}>
            <PublicAsset src={BUBBLE_SRC} alt="" className="block h-auto w-full select-none" aria-hidden="true" />
            <span className={ICON_WRAP_CLASS}>
                <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
            </span>
        </div>
    )
}
