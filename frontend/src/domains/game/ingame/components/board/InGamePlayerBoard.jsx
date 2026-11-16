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
  isInGameEmojiPhase,
  readEmojiScope,
  selectInGameEmojiScope,
} from "../../utils/selectInGameEmojiScope.js"
import { allyReadingName, allyText } from "../../utils/allyLabel.js"
import { INGAME_PLAYER_STATUS_TEXT as STATUS_TEXT } from "../../constants/board/ingamePlayerStatusText.js"
import InGamePlayerCard from "./InGamePlayerCard.jsx"
import InGamePlayerCardMenu from "./InGamePlayerCardMenu.jsx"
import InGameEmojiPalette from "./InGameEmojiPalette.jsx"
import InGameEmojiBubble from "./InGameEmojiBubble.jsx"

export default function InGamePlayerBoard() {
  const { players, localPlayerId } = useInGamePlayerSessionContext()
  const actionCtx = useContext(InGameActionContext)
  const cardMenu = useInGamePlayerCardMenu()
  const presets = getSlotPresets(players.length)
  // 내 직업: 같은 직업 동료 표시 글("동료 의사")을 만드는 데 씀
  const selfRole = actionCtx?.gameState?.self?.role ?? null

  const emojiByUuid = useInGameEmojiBubbleStore((state) => state.byUuid)
  const emojiSlots = useEmojiPaletteStore((state) => state.gameSlots)

  const emojiGameId = useInGameStore((state) => state.gameId)
  const emojiGameState = useInGameStore((state) => state.state)
  const authUuid = useAuthStore((state) => state.user?.uuid ?? null)
  const identityGeneration = useAuthStore((state) => state.identityGeneration ?? null)
  const emojiScopeKey = inGameEmojiScopeKey(
    selectInGameEmojiScope({ gameId: emojiGameId, state: emojiGameState }, authUuid, identityGeneration),
  )

  // 이모티콘은 낮에만: 내 판이고 낮일 때만 팔레트를 엶 (역할 확인·재판·밤엔 안 열림)
  const emojiOpenable = emojiScopeKey !== null && isInGameEmojiPhase(emojiGameState)

  // 팔레트 연 카드와 그때 범위 (범위가 바뀌거나 낮이 끝나면 열린 팔레트는 없는 것으로 봄)
  const [emojiPalette, setEmojiPalette] = useState(null)
  // 낮이 끝나면 열림 기록도 지움 (다음 낮에 팔레트가 저절로 다시 열리지 않게, 그리는 중에 바로 맞춤)
  if (!emojiOpenable && emojiPalette !== null) setEmojiPalette(null)
  const emojiPaletteTargetId = emojiOpenable && emojiPalette !== null && emojiPalette.scopeKey === emojiScopeKey
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

  // 팔레트가 열린 동안 판을 채팅 칸(z-20) 위로 올림 (판이 z-10 층이라 팔레트 칸이 채팅 칸 밑에 깔려 못 누르던 것 막기)
  const boardStyle = emojiPaletteTargetId !== null ? { zIndex: 25 } : undefined

  return (
    <div className={POSITION_CLASS} style={boardStyle}>
      {players.map((player, index) => {
        const activeEmoji = emojiByUuid[player.id] ?? null
        const isSelf = isInGameSelfPlayer(player.id, localPlayerId)
        // 같은 직업 동료면 표시 글과 읽기 이름 (내 화면에만, 시민·남은 null)
        // 예: 의사인 내 화면의 동료 민수 → allyLabel "동료 의사", 읽기 이름 "민수 · 동료 의사" (죽었으면 뒤에 ", 사망")
        const allyLabel = allyText(player, selfRole)
        const targetName = allyReadingName(player, selfRole)
        const allyCardName = allyLabel
          ? [targetName, STATUS_TEXT[player.status]].filter(Boolean).join(", ")
          : undefined
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
              aria-label={allyCardName}
              aria-haspopup="menu"
              aria-expanded={cardMenu.isOpen(player.id)}
              onClick={() => cardMenu.openMenu(player.id)}
              onMouseDown={(event) => {
                // 우클릭 누르는 순간 엶 (OS마다 우클릭 메뉴 시점이 달라 끌어 고르기가 어긋나지 않게)
                if (event.button !== 2 || !isSelf || !emojiOpenable) return
                setEmojiPaletteTargetId(player.id)
              }}
              onContextMenu={(event) => {
                if (!isSelf) return
                event.preventDefault()
                if (!emojiOpenable) return
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
                allyLabel={allyLabel}
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
                targetName={targetName}
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
