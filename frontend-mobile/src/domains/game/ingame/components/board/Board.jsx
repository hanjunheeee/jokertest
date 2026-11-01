// 인게임 카드 판: 참가자 카드 격자(7~10명 5×2, 6명 이하 3×2)·카드 시트·이모티콘 팔레트
// InGamePage가 씀, props 없이 데스크톱 세션·행동 컨텍스트·스토어로 값 읽음
import { useContext } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useInGameEmojiBubbleStore } from "@/domains/game/ingame/store/inGameEmojiBubble.store.js"
import { isInGameSelfPlayer } from "@/domains/game/ingame/utils/isInGameSelfPlayer.js"
import { useBoardEmoji } from "@m/domains/game/ingame/hooks/board/useBoardEmoji.js"
import { useCardSheet } from "@m/domains/game/ingame/hooks/board/useCardSheet.js"
import { BOARD_ROOT_CLASS, BOARD_ROW_CLASS, BOARD_ROW_STYLE, boardColumns } from "./boardStyle.js"
import CardSheet from "./CardSheet.jsx"
import CardSlot from "./CardSlot.jsx"
import EmojiPalette from "./EmojiPalette.jsx"

// 카드 탭은 시트, 내 카드 길게 누르기(데스크톱 우클릭)는 팔레트 (내 판일 때만)
export default function Board() {
    const { players, localPlayerId } = useInGamePlayerSessionContext()
    const actionCtx = useContext(InGameActionContext)
    const emojiByUuid = useInGameEmojiBubbleStore((state) => state.byUuid)
    const sheet = useCardSheet()
    const emoji = useBoardEmoji()
    const sheetPlayer = players.find((player) => player.id === sheet.targetId) ?? null

    return (
        <section aria-label="플레이어 카드" className={BOARD_ROOT_CLASS} style={{ "--cols": boardColumns(players.length) }}>
            <div className={BOARD_ROW_CLASS} style={BOARD_ROW_STYLE}>
                {players.map((player) => {
                    const isSelf = isInGameSelfPlayer(player.id, localPlayerId)
                    // 고른 투표·밤 대상이면 강조 (데스크톱과 같은 조건)
                    const highlight = player.id === actionCtx?.selectedDayVoteTargetId
                        || player.id === actionCtx?.selectedNightTargetId
                    return (
                        <CardSlot
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
            <CardSheet player={sheetPlayer} items={sheet.items} onClose={sheet.close} panelRef={sheet.menuRef} />
            <EmojiPalette open={emoji.open} slots={emoji.slots} onClose={emoji.closePalette} />
        </section>
    )
}
