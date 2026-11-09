// 인게임 가운데 플레이어 카드 판 (인원수별 자리 배치)
// InGamePage가 씀
import { useContext, useEffect, useState } from "react"
import {
  POSITION_CLASS,
  buildSlotStyle,
  getSlotPresets,
} from "../../constants/board/ingamePlayerBoard.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import { isInGameSelfPlayer } from "../../utils/isInGameSelfPlayer.js"
import { InGameActionContext } from "../../context/InGameActionContext.jsx"
import { useInGamePlayerCardMenu } from "../../hooks/useInGamePlayerCardMenu.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { useInGameEmojiBubbleStore } from "../../store/inGameEmojiBubble.store.js"
import { useAuthStore } from "../../../../auth/store/auth.store.js"
import { useEmojiPaletteStore } from "../../../../user/store/emojiPalette.store.js"
import {
  inGameEmojiScopeKey,
  readEmojiScope,
  selectInGameEmojiScope,
} from "../../utils/selectInGameEmojiScope.js"
import InGamePlayerCard from "./InGamePlayerCard.jsx"
import InGamePlayerCardMenu from "./InGamePlayerCardMenu.jsx"
import InGameEmojiPalette from "./InGameEmojiPalette.jsx"
import InGameEmojiBubble from "./InGameEmojiBubble.jsx"

export default function InGamePlayerBoard() {
  const { players, localPlayerId } = useInGamePlayerSessionContext()
  const actionCtx = useContext(InGameActionContext)
  const cardMenu = useInGamePlayerCardMenu()
  const presets = getSlotPresets(players.length)

  const emojiByUuid = useInGameEmojiBubbleStore((state) => state.byUuid)
  const emojiSlots = useEmojiPaletteStore((state) => state.gameSlots)

  const emojiGameId = useInGameStore((state) => state.gameId)
  const emojiGameState = useInGameStore((state) => state.state)
  const authUuid = useAuthStore((state) => state.user?.uuid ?? null)
  const identityGeneration = useAuthStore((state) => state.identityGeneration ?? null)
  const emojiScopeKey = inGameEmojiScopeKey(
    selectInGameEmojiScope({ gameId: emojiGameId, state: emojiGameState }, authUuid, identityGeneration),
  )

  // 팔레트 연 카드와 그때 범위 (범위가 바뀌면 열린 팔레트는 없는 것으로 봄)
  const [emojiPalette, setEmojiPalette] = useState(null)
  const emojiPaletteTargetId = emojiPalette !== null && emojiPalette.scopeKey === emojiScopeKey
    ? emojiPalette.targetId
    : null
  const setEmojiPaletteTargetId = (targetId) => {
    setEmojiPalette(targetId === null ? null : { targetId, scopeKey: emojiScopeKey })
  }

  useEffect(() => {
    if (emojiScopeKey === null) return
    useEmojiPaletteStore.getState().loadForGame(readEmojiScope())
  }, [emojiScopeKey])

  const handleEmojiSelect = () => {
    setEmojiPaletteTargetId(null)
  }

  return (
    <div className={POSITION_CLASS}>
      {players.map((player, index) => {
        const activeEmoji = emojiByUuid[player.id] ?? null
        const isSelf = isInGameSelfPlayer(player.id, localPlayerId)
        return (
          // 카드 누름 칸과 메뉴·팔레트를 형제로 둠 (누를 수 있는 것 안에 또 버튼이 들어가지 않게)
          <div
            key={player.id}
            ref={(node) => cardMenu.registerAnchor(player.id, node)}
            className="absolute pointer-events-auto"
            style={buildSlotStyle(presets[index])}
          >
            <div
              className="relative w-full cursor-pointer rounded-full outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"
              role="button"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={cardMenu.isOpen(player.id)}
              onClick={() => cardMenu.openMenu(player.id)}
              onMouseDown={(event) => {
                // 우클릭 누르는 순간 엶 (OS마다 우클릭 메뉴 시점이 달라 끌어 고르기가 어긋나지 않게)
                if (event.button !== 2 || !isSelf || emojiScopeKey === null) return
                setEmojiPaletteTargetId(player.id)
              }}
              onContextMenu={(event) => {
                if (!isSelf) return
                event.preventDefault()
                if (emojiScopeKey === null) return
                setEmojiPaletteTargetId(player.id)
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                cardMenu.openMenu(player.id)
              }}
            >
              <InGamePlayerCard
                portraitSrc={player.portraitSrc}
                frameSrc={player.frameSrc}
                nickname={player.nickname}
                status={player.status}
                theme={player.theme}
                voteHighlight={
                  player.id === actionCtx?.selectedDayVoteTargetId
                  || player.id === actionCtx?.selectedNightTargetId
                }
                isSelf={isSelf}
                className="w-full"
              />
              {activeEmoji ? (
                <InGameEmojiBubble
                  key={`${player.id}-${activeEmoji.sentAt}`}
                  itemId={activeEmoji.itemId}
                />
              ) : null}
            </div>
            {cardMenu.isOpen(player.id) ? (
              <InGamePlayerCardMenu
                menuRef={cardMenu.menuRef}
                items={cardMenu.getItems(player.id)}
                onClose={cardMenu.closeMenu}
              />
            ) : null}
            {emojiPaletteTargetId === player.id ? (
              <InGameEmojiPalette
                slots={emojiSlots ?? []}
                onSelect={handleEmojiSelect}
                onClose={() => setEmojiPaletteTargetId(null)}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
