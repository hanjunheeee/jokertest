// 초상 띠 한 칸: 작은 플레이어 카드 + 받은 이모티콘 작게, 탭이면 카드 메뉴·내 칸 길게 누르면 이모티콘 팔레트
// PortraitStrip이 참가자마다 씀, 카드 그림은 카드 판과 같은 PlayerCard (그림 분위기 그대로)
import { findInGameEmoticonItem } from "@/domains/game/ingame/utils/findInGameEmoticonItem.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import PlayerCard from "@m/domains/game/ingame/components/board/PlayerCard.jsx"
import { useLongPress } from "@m/domains/game/ingame/hooks/board/useLongPress.js"

// 카드 폭: 10명이어도 넘겨 보면 되니 손가락으로 누르기 편한 크기 (높이는 카드 그림 비율)
const SLOT_CLASS =
    "relative w-[3.7rem] shrink-0 cursor-pointer border-0 bg-transparent p-0 pt-1.5 [-webkit-touch-callout:none] select-none active:scale-[0.97]"

// 띠는 가로 스크롤이라 카드 위로 넘치는 말풍선이 잘림 → 카드 안 오른쪽 위에 작게
const EMOJI_CLASS =
    "pointer-events-none absolute right-[-0.2rem] top-0 z-30 flex h-7 w-7 items-center justify-center rounded-full border border-[#e8c878] bg-[#2a140a]/90 p-0.5 shadow-[0_2px_6px_rgba(0,0,0,0.6)]"

function StripEmoji({ itemId }) {
    const item = findInGameEmoticonItem(itemId)
    if (!item) return null
    return (
        <span className={EMOJI_CLASS} data-ingame-emoji-bubble={item.id}>
            <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
        </span>
    )
}

export default function StripSlot({ player, isSelf, highlight, emoji, anchorRef, onTap, onLongPress }) {
    const longPress = useLongPress(onLongPress)

    // 길게 누르기 뒤 손 뗄 때 오는 탭은 메뉴를 열지 않음 (카드 판 CardSlot과 같음)
    const handleClick = () => {
        if (longPress.shouldSkipClick()) return
        onTap()
    }

    // 안드로이드 길게 누르기·마우스 우클릭은 contextmenu로 옴
    const handleContextMenu = (event) => {
        event.preventDefault()
        if (typeof onLongPress === "function") onLongPress()
    }

    return (
        <button
            ref={anchorRef}
            type="button"
            className={SLOT_CLASS}
            aria-label={player.nickname}
            data-strip-slot={player.id}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            {...longPress.handlers}
        >
            <PlayerCard
                portraitSrc={player.portraitSrc}
                frameSrc={player.frameSrc}
                nickname={player.nickname}
                status={player.status}
                theme={player.theme}
                voteHighlight={highlight}
                isSelf={isSelf}
                className="pointer-events-none w-full"
            />
            {emoji ? <StripEmoji key={`${player.id}-${emoji.sentAt}`} itemId={emoji.itemId} /> : null}
        </button>
    )
}
