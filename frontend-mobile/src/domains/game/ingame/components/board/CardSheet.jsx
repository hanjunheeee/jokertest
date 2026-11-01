// 카드 시트: 카드를 누르면 아래에서 올라오는 투표·재판·밤 행동 버튼 묶음
// Board가 씀 (데스크톱 카드 위 덮개 메뉴 대신, 항목·버튼 그림·취소 규칙은 데스크톱과 같음)
import { INGAME_CARD_MENU_ITEM_KINDS as KINDS } from "@/domains/game/ingame/constants/board/playerCardMenu.js"
import MenuButton from "./MenuButton.jsx"
import Sheet from "./Sheet.jsx"

// 시험이 메뉴를 찾는 표시 (데스크톱과 같은 이름)
const MENU_ATTR = "data-ingame-player-card-menu"

// 취소류·유죄는 취소 그림 (데스크톱 resolveOverlayButtonAsset)
const CANCEL_TONE_KINDS = new Set([KINDS.DAY_VOTE_CANCEL, KINDS.NIGHT_ACTION_CANCEL, KINDS.TRIBUNAL_GUILTY])
// 낮 투표·밤 행동 항목이 있으면 따로 취소 버튼을 안 붙임 (데스크톱 규칙)
const SINGLE_ACTION_KINDS = new Set([KINDS.DAY_VOTE, KINDS.DAY_VOTE_CANCEL, KINDS.NIGHT_ACTION, KINDS.NIGHT_ACTION_CANCEL])

// 버튼 줄은 데스크톱처럼 위아래로 쌓음 (OVERLAY_ACTIONS_CLASS와 같은 방향)
const ACTIONS_CLASS = "mx-auto flex w-full max-w-[16rem] flex-col items-stretch gap-y-2"

// player가 없으면 닫힌 시트, 제목은 어느 카드인지 알리는 이름
export default function CardSheet({ player, items, onClose, panelRef }) {
    const visibleItems = items.filter((item) => item.visible !== false)
    const showCancel = !visibleItems.some((item) => SINGLE_ACTION_KINDS.has(item.kind))

    return (
        <Sheet open={player !== null} title={player?.nickname ?? ""} onClose={onClose} panelRef={panelRef} {...{ [MENU_ATTR]: "true" }}>
            <div role="menu" aria-label="플레이어 행동" className={ACTIONS_CLASS}>
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
                {showCancel ? <MenuButton kind="CANCEL" label="취소" tone="cancel" onClick={onClose} /> : null}
            </div>
        </Sheet>
    )
}
