// 파일 역할: InGamePlayerBoard.jsx - 화면을 구성하는 컴포넌트입니다.
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

/**
 * 인게임 플레이어 보드 — G센세 prototype 10인 링 배치
 *
 * V-1: 카드 좌클릭으로 투표·재판·밤 행동 메뉴를 연다. 메뉴 상태(한 번에 하나)는
 * useInGamePlayerCardMenu가 보드 전체에서 하나만 들고 있고, 선택 강조는 컨트롤 패널과 **같은**
 * InGameActionContext 값에서 읽는다 — 두 경로가 서로 다른 선택 상태를 그리지 않게 한다.
 *
 * E-3(F-33 AC-03/AC-04): **본인 카드 우클릭**은 이모티콘 팔레트를 연다(타인 카드는 열지 않고,
 * 좌클릭 메뉴는 그대로다 — 두 입력은 서로를 대체하지 않는다). 팔레트 8칸의 근거는 이 판에
 * 고정된 emojiPalette.store의 사본이고, 수신한 emoji_shown은 해당 uuid 카드 위에 말풍선으로
 * 뜬다. 3초 만료 타이머는 이 컴포넌트가 아니라 inGameEmojiBubble.store가 소유한다.
 *
 * 훅은 전부 최상단에서 한 번씩만 부른다 — players.map 안에서 부르면 명단 길이가 바뀔 때마다
 * 훅 순서가 달라진다.
 */
export default function InGamePlayerBoard() {
  const { players, localPlayerId } = useInGamePlayerSessionContext()
  const actionCtx = useContext(InGameActionContext)
  const cardMenu = useInGamePlayerCardMenu()
  const presets = getInGamePlayerSlotPresets(players.length)

  const emojiByUuid = useInGameEmojiBubbleStore((state) => state.byUuid)
  const emojiSlots = useEmojiPaletteStore((state) => state.gameSlots)

  // 팔레트를 띄울 수 있는 판인지 판정할 네 값. 구독해야 하는 값이라 selector로 읽는다 —
  // getState()로 한 번 읽으면 판이 끝나거나 내가 빠진 뒤에도 화면이 그것을 모른다.
  const emojiGameId = useInGameStore((state) => state.gameId)
  const emojiGameState = useInGameStore((state) => state.state)
  const authUuid = useAuthStore((state) => state.user?.uuid ?? null)
  const identityGeneration = useAuthStore((state) => state.identityGeneration ?? null)
  const emojiScopeKey = inGameEmojiScopeKey(
    selectInGameEmojiScope({ gameId: emojiGameId, state: emojiGameState }, authUuid, identityGeneration),
  )

  // 팔레트가 열린 카드(본인 카드 하나뿐이다). 대상 id로 들고 있어 명단이 바뀌면 자연히 닫힌다.
  const [emojiPaletteTargetId, setEmojiPaletteTargetId] = useState(null)

  // 이 판의 8칸을 한 번만 읽는다. 같은 scope의 중복 호출은 store가 합치므로 StrictMode의
  // 이중 effect와 같은 판의 재마운트에서 GET이 추가로 나가지 않는다.
  useEffect(() => {
    if (emojiScopeKey === null) return
    // loadForGame은 거부를 스스로 잡아 gameStatus='error'로 끝낸다(처리되지 않은 rejection 없음).
    useEmojiPaletteStore.getState().loadForGame(readInGameEmojiScope())
  }, [emojiScopeKey])

  // 계정·판·참여가 바뀌면 열려 있던 팔레트는 지난 국면의 것이다.
  useEffect(() => {
    setEmojiPaletteTargetId(null)
  }, [emojiScopeKey])

  // 전송은 **팔레트가 소유한다**(InGameEmojiPalette가 useInGameEmojiSend를 직접 부른다). 보드가
  // 여기서 한 번 더 보내면 한 제스처가 send_emoji를 두 번 만들어, 두 번째 전송이 서버의 1초 간격
  // 제한에 걸리거나(RATE_LIMITED) 같은 말풍선이 두 번 방송된다 — 그래서 이 콜백은 "한 칸이
  // 선택됐다"는 신호를 받아 팔레트를 닫는 일만 한다.
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
            className="absolute pointer-events-auto"
            style={buildInGamePlayerSlotStyle(presets[index])}
            role="button"
            tabIndex={0}
            onClick={() => cardMenu.openMenu(player.id)}
            onContextMenu={(event) => {
              // 타인 카드에서는 아무것도 하지 않는다 — 브라우저 기본 메뉴도 막지 않는다.
              if (!isSelf) return
              event.preventDefault()
              // 이 판의 참가자가 아니면(종료·이탈·계정 불일치) 보낼 수 있는 것이 없다.
              if (emojiScopeKey === null) return
              setEmojiPaletteTargetId(player.id)
            }}
            onKeyDown={(event) => {
              // 메뉴 버튼에서 올라온 키는 무시한다 — 슬롯 자신이 초점을 가진 경우만 연다.
              if (event.target !== event.currentTarget) return
              if (event.key !== "Enter" && event.key !== " ") return
              cardMenu.openMenu(player.id)
            }}
          >
            <InGamePlayerCard
              portraitSrc={player.portraitSrc}
              frameSrc={player.frameSrc}
              accountBorderSrc={player.accountBorderSrc}
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
              // key에 sentAt을 섞어 재수신이 **새 말풍선**으로 그려지게 한다(같은 itemId를
              // 다시 받아도 교체가 화면에 보인다). 사라지는 시점은 store의 타이머가 정한다.
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
