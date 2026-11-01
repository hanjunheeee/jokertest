// 카드 시트: 카드를 누르면 아래에서 올라옴 (플레이어 정보 + 투표·재판·밤 행동·추방 버튼 + 내 카드면 이모티콘)
// Board가 씀 (데스크톱 카드 위 덮개 메뉴 대신, 항목·고르기는 데스크톱 카드 메뉴 훅 그대로)
import { INGAME_CARD_MENU_ITEM_KINDS as KINDS } from "@/domains/game/ingame/constants/board/playerCardMenu.js"
import MenuButton from "./MenuButton.jsx"
import PlayerSummary from "./PlayerSummary.jsx"
import Sheet from "./Sheet.jsx"

// 시험이 메뉴를 찾는 표시 (데스크톱과 같은 이름)
const MENU_ATTR = "data-ingame-player-card-menu"

// 취소류·유죄·추방은 취소 그림
const CANCEL_TONE_KINDS = new Set([KINDS.DAY_VOTE_CANCEL, KINDS.NIGHT_ACTION_CANCEL, KINDS.TRIBUNAL_GUILTY])
// 낮 투표·밤 행동 항목이 있으면 따로 취소 버튼을 안 붙임 (데스크톱 규칙)
const SINGLE_ACTION_KINDS = new Set([KINDS.DAY_VOTE, KINDS.DAY_VOTE_CANCEL, KINDS.NIGHT_ACTION, KINDS.NIGHT_ACTION_CANCEL])

const EMPTY_TEXT = "지금 이 카드로 할 수 있는 행동이 없습니다"

// player가 없으면 닫힌 시트
export default function CardSheet({ player, isSelf, items, canSendEmoji, onOpenEmoji, onClose, panelRef }) {
    const visibleItems = items.filter((item) => item.visible !== false)
    const showCancel = visibleItems.length > 0 && !visibleItems.some((item) => SINGLE_ACTION_KINDS.has(item.kind))
    const showEmoji = isSelf && canSendEmoji
    const isEmpty = visibleItems.length === 0 && !showEmoji

    return (
        <Sheet open={player !== null} title={player?.nickname ?? ""} onClose={onClose} panelRef={panelRef} {...{ [MENU_ATTR]: "true" }}>
            <PlayerSummary player={player} isSelf={isSelf} />
            <div role="menu" aria-label="플레이어 행동" className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-2">
                {visibleItems.map((item) => (
                    <MenuButton
                        key={item.kind}
                        kind={item.kind}
                        label={item.label}
                        tone={CANCEL_TONE_KINDS.has(item.kind) ? "cancel" : "confirm"}
                        disabled={!item.enabled}
                        disabledReason={item.disabledReason}
                        onClick={() => item.onSelect?.()}
                    />
                ))}
                {showEmoji ? <MenuButton kind="EMOJI" label="이모티콘 보내기" onClick={onOpenEmoji} /> : null}
                {showCancel ? <MenuButton kind="CANCEL" label="취소" tone="cancel" onClick={onClose} /> : null}
            </div>
            {isEmpty ? <p className="mt-3 text-center text-sm text-[#5b3a2a]">{EMPTY_TEXT}</p> : null}
            {showEmoji ? (
                <p className="mt-3 text-center text-xs text-[#5b3a2a]">내 카드를 길게 눌러도 이모티콘 팔레트가 열립니다</p>
            ) : null}
        </Sheet>
    )
}
