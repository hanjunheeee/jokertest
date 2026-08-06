// 파일 역할: InGamePlayerBoard.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  INGAME_PLAYER_BOARD_POSITION_CLASS,
  buildInGamePlayerSlotStyle,
  getInGamePlayerSlotPresets,
} from "../../constants/board/ingamePlayerBoard.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import { isInGameSelfPlayer } from "../../utils/isInGameSelfPlayer.js"
import InGamePlayerCard from "./InGamePlayerCard.jsx"

/**
 * 인게임 플레이어 보드 — G센세 prototype 10인 링 배치
 */
export default function InGamePlayerBoard() {
  const { players, localPlayerId } = useInGamePlayerSessionContext()
  const presets = getInGamePlayerSlotPresets(players.length)

  return (
    <div className={INGAME_PLAYER_BOARD_POSITION_CLASS}>
      {players.map((player, index) => (
        <div
          key={player.id}
          className="absolute pointer-events-auto"
          style={buildInGamePlayerSlotStyle(presets[index])}
        >
          <InGamePlayerCard
            portraitSrc={player.portraitSrc}
            frameSrc={player.frameSrc}
            nickname={player.nickname}
            status={player.status}
            theme={player.theme}
            // 닉네임·배열 위치가 아니라 canonical uuid 동등성만으로 본인 여부를 판정한다 —
            // 닉네임이 같은 참가자가 여러 명이어도 정확히 uuid가 일치하는 한 명만 표시된다.
            isSelf={isInGameSelfPlayer(player.id, localPlayerId)}
            className="w-full"
          />
        </div>
      ))}
    </div>
  )
}
