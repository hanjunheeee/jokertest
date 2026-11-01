// 카드 판 한 칸: 카드 그림 + 표시 띠 + 이모티콘 말풍선, 탭이면 카드 시트·내 카드 길게 누르면 팔레트
// Board가 참가자마다 씀
import { useLongPress } from "@m/domains/game/ingame/hooks/board/useLongPress.js"
import { CARD_WIDTH, SLOT_CLASS } from "./boardStyle.js"
import EmojiBubble from "./EmojiBubble.jsx"
import PlayerCard from "./PlayerCard.jsx"
import TargetMark from "./TargetMark.jsx"

const SLOT_STYLE = { width: CARD_WIDTH }

// onLongPress·onContextMenu가 없으면 길게 누르기·우클릭은 기본 동작 막기만 함
export default function CardSlot({ player, isSelf, highlight, mark, emoji, anchorRef, onTap, onLongPress }) {
    const longPress = useLongPress(onLongPress)

    // 길게 누르기 뒤 손 뗄 때 오는 탭은 시트를 열지 않음
    const handleClick = () => {
        if (longPress.shouldSkipClick()) return
        onTap()
    }

    // 안드로이드 길게 누르기·마우스 우클릭은 contextmenu로 옴 (데스크톱처럼 내 카드면 팔레트)
    const handleContextMenu = (event) => {
        event.preventDefault()
        if (typeof onLongPress === "function") onLongPress()
    }

    return (
        <button
            ref={anchorRef}
            type="button"
            className={SLOT_CLASS}
            style={SLOT_STYLE}
            aria-label={`${player.nickname}${isSelf ? " (나)" : ""} 카드 메뉴`}
            aria-haspopup="dialog"
            data-board-slot={player.id}
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
            <TargetMark mark={mark} />
            {emoji ? <EmojiBubble key={`${player.id}-${emoji.sentAt}`} itemId={emoji.itemId} /> : null}
        </button>
    )
}
