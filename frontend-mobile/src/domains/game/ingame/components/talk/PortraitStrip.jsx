// 초상 띠 (카톡형): 참가자 작은 카드 한 줄 가로 넘기기 + 끝에 "카드 판 크게" 단추, 펼치면 지금 카드 판 그대로
// TalkLayout이 위 단계 줄 아래에 씀, 카드 메뉴·이모티콘 팔레트는 카드 판(Board)과 같은 훅
import { useContext } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useInGameEmojiBubbleStore } from "@/domains/game/ingame/store/inGameEmojiBubble.store.js"
import { isInGameSelfPlayer } from "@/domains/game/ingame/utils/isInGameSelfPlayer.js"
import Board from "@m/domains/game/ingame/components/board/Board.jsx"
import CardSheet from "@m/domains/game/ingame/components/board/CardSheet.jsx"
import EmojiPalette from "@m/domains/game/ingame/components/board/EmojiPalette.jsx"
import { useBoardEmoji } from "@m/domains/game/ingame/hooks/board/useBoardEmoji.js"
import { useCardSheet } from "@m/domains/game/ingame/hooks/board/useCardSheet.js"
import StripSlot from "./StripSlot.jsx"

const ROW_CLASS =
    "flex min-w-0 flex-1 items-start gap-1.5 overflow-x-auto overscroll-x-contain px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

const TOGGLE_CLASS =
    "flex h-11 w-11 shrink-0 cursor-pointer flex-col items-center justify-center self-center rounded-xl border border-[#b08a4a]/60 bg-black/50 p-0 text-[0.6rem] leading-tight text-[#f3dcb0] active:scale-95"

// 펼친 카드 판: 채팅방을 다 가리지 않게 높이 제한, 넘치면 안에서 스크롤
const BOARD_WRAP_CLASS = "max-h-[46svh] min-h-0 overflow-y-auto overscroll-contain px-1.5"

function ToggleButton({ expanded, onToggle }) {
    return (
        <button type="button" className={TOGGLE_CLASS} onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? "카드 판 접기" : "카드 판 크게 보기"}>
            <span aria-hidden className={`text-[0.8rem] transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
            <span aria-hidden>{expanded ? "접기" : "크게"}</span>
        </button>
    )
}

// 접힌 띠: 칸 누르면 카드 메뉴, 내 칸 길게 누르면 팔레트 (카드 판과 같은 조건)
function CollapsedStrip({ onToggle }) {
    const { players, localPlayerId } = useInGamePlayerSessionContext()
    const actionCtx = useContext(InGameActionContext)
    const emojiByUuid = useInGameEmojiBubbleStore((state) => state.byUuid)
    const sheet = useCardSheet()
    const emoji = useBoardEmoji()
    const sheetPlayer = players.find((player) => player.id === sheet.targetId) ?? null

    return (
        <section aria-label="플레이어 초상 띠" className="flex w-full min-w-0 items-start pr-1.5">
            <div className={ROW_CLASS}>
                {players.map((player) => {
                    const isSelf = isInGameSelfPlayer(player.id, localPlayerId)
                    const highlight = player.id === actionCtx?.selectedDayVoteTargetId
                        || player.id === actionCtx?.selectedNightTargetId
                    return (
                        <StripSlot
                            key={player.id}
                            player={player}
                            isSelf={isSelf}
                            highlight={highlight}
                            emoji={emojiByUuid[player.id] ?? null}
                            anchorRef={(node) => sheet.registerAnchor(player.id, node)}
                            onTap={() => sheet.open(player.id)}
                            onLongPress={isSelf && emoji.canOpen ? emoji.openPalette : null}
                        />
                    )
                })}
            </div>
            <ToggleButton expanded={false} onToggle={onToggle} />
            <CardSheet player={sheetPlayer} items={sheet.items} onClose={sheet.close} panelRef={sheet.menuRef} />
            <EmojiPalette open={emoji.open} slots={emoji.slots} onClose={emoji.closePalette} />
        </section>
    )
}

// 펼치면 띠 대신 카드 판 (카드 판이 자기 메뉴·팔레트를 가져서 둘이 겹치지 않음)
export default function PortraitStrip({ expanded, onToggle }) {
    if (!expanded) return <CollapsedStrip onToggle={onToggle} />

    return (
        <div className="flex w-full min-w-0 flex-col">
            <div className={BOARD_WRAP_CLASS}>
                <Board />
            </div>
            <div className="flex justify-end px-1.5">
                <ToggleButton expanded onToggle={onToggle} />
            </div>
        </div>
    )
}
