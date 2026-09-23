// 파일 역할: InGamePlayerBoard.jsx - 화면을 구성하는 컴포넌트입니다.
import { useContext } from "react"
import {
  INGAME_PLAYER_BOARD_POSITION_CLASS,
  buildInGamePlayerSlotStyle,
  getInGamePlayerSlotPresets,
} from "../../constants/board/ingamePlayerBoard.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import { isInGameSelfPlayer } from "../../utils/isInGameSelfPlayer.js"
import { InGameActionContext } from "../../context/InGameActionContext.jsx"
import { useInGamePlayerCardMenu } from "../../hooks/useInGamePlayerCardMenu.js"
import InGamePlayerCard from "./InGamePlayerCard.jsx"
import InGamePlayerCardMenu from "./InGamePlayerCardMenu.jsx"

/**
 * 인게임 플레이어 보드 — G센세 prototype 10인 링 배치
 *
 * V-1: 카드 좌클릭으로 투표·재판·밤 행동 메뉴를 연다. 메뉴 상태(한 번에 하나)는
 * useInGamePlayerCardMenu가 보드 전체에서 하나만 들고 있고, 선택 강조는 컨트롤 패널과 **같은**
 * InGameActionContext 값에서 읽는다 — 두 경로가 서로 다른 선택 상태를 그리지 않게 한다.
 * 우클릭(onContextMenu)은 붙이지 않는다.
 */
export default function InGamePlayerBoard() {
  const { players, localPlayerId } = useInGamePlayerSessionContext()
  const actionCtx = useContext(InGameActionContext)
  const cardMenu = useInGamePlayerCardMenu()
  const presets = getInGamePlayerSlotPresets(players.length)

  return (
    <div className={INGAME_PLAYER_BOARD_POSITION_CLASS}>
      {players.map((player, index) => (
        <div
          key={player.id}
          ref={(node) => cardMenu.registerAnchor(player.id, node)}
          className="absolute pointer-events-auto"
          style={buildInGamePlayerSlotStyle(presets[index])}
          role="button"
          tabIndex={0}
          onClick={() => cardMenu.openMenu(player.id)}
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
            isSelf={isInGameSelfPlayer(player.id, localPlayerId)}
            className="w-full"
          />
          {cardMenu.isOpen(player.id) ? (
            <InGamePlayerCardMenu
              menuRef={cardMenu.menuRef}
              items={cardMenu.getItems(player.id)}
              onClose={cardMenu.closeMenu}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}
