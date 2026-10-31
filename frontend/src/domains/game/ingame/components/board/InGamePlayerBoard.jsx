import { useContext, useEffect, useState } from "react"
import {
  INGAME_PLAYER_BOARD_POSITION_CLASS,
  buildInGamePlayerSlotStyle,
  getInGamePlayerSlotPresets,
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
  readInGameEmojiScope,
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
  const presets = getInGamePlayerSlotPresets(players.length)

  const emojiByUuid = useInGameEmojiBubbleStore((state) => state.byUuid)
  const emojiSlots = useEmojiPaletteStore((state) => state.gameSlots)

  const emojiGameId = useInGameStore((state) => state.gameId)
  const emojiGameState = useInGameStore((state) => state.state)
  const authUuid = useAuthStore((state) => state.user?.uuid ?? null)
  const identityGeneration = useAuthStore((state) => state.identityGeneration ?? null)
  const emojiScopeKey = inGameEmojiScopeKey(
    selectInGameEmojiScope({ gameId: emojiGameId, state: emojiGameState }, authUuid, identityGeneration),
  )

  const [emojiPaletteTargetId, setEmojiPaletteTargetId] = useState(null)

  useEffect(() => {
    if (emojiScopeKey === null) return
    useEmojiPaletteStore.getState().loadForGame(readInGameEmojiScope())
  }, [emojiScopeKey])

  useEffect(() => {
    setEmojiPaletteTargetId(null)
  }, [emojiScopeKey])

  const handleEmojiSelect = () => {
    setEmojiPaletteTargetId(null)
  }

  return (
    <div className={INGAME_PLAYER_BOARD_POSITION_CLASS}>
      {players.map((player, index) => {
        const activeEmoji = emojiByUuid[player.id] ?? null
        const isSelf = isInGameSelfPlayer(player.id, localPlayerId)
        return (
          <div
            key={player.id}
            ref={(node) => cardMenu.registerAnchor(player.id, node)}
            className="absolute pointer-events-auto cursor-pointer"
            style={buildInGamePlayerSlotStyle(presets[index])}
            role="button"
            tabIndex={0}
            onClick={() => cardMenu.openMenu(player.id)}
            onContextMenu={(event) => {
              if (!isSelf) return
              event.preventDefault()
              if (emojiScopeKey === null) return
              setEmojiPaletteTargetId(player.id)
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return
              if (event.key !== "Enter" && event.key !== " ") return
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
