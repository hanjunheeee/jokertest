// 결과 화면 참가자 정체 목록: 틀·제목·이긴 진영 배지·참가자 줄(스크롤)
// GameResultShell이 씀, 틀 그림은 승패 따라 바뀜
import { useRef } from "react"
import { resolvePlayerListFrame } from "../constants/gameResultAssets.js"
import {
  FRAME_IMG_FILL_CLASS,
  FRAME_SHADOW_LAYER_FILL_CLASS,
  PLAYER_LIST_INSET_CLASS,
  PLAYER_LIST_SCROLL_CLASS,
  PLAYER_LIST_SCROLL_WRAP_CLASS,
  PLAYER_LIST_SCROLLBAR_CLASS,
  PLAYER_LIST_TITLE_CLASS,
  PLAYER_LIST_WRAP_CLASS,
} from "../constants/gameResultLayout.js"
import GameResultPlayerRow from "./GameResultPlayerRow.jsx"
import GameResultWinningTeamBadge from "./GameResultWinningTeamBadge.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 참가자 정체 목록
export default function GameResultPlayerList({
  outcome = "win",
  winningTeam = null,
  players = [],
  selfUuid = null,
}) {
  // 스크롤바가 목록 스크롤을 읽게 ref 같이 넘김
  const scrollRef = useRef(null)
  const playerListFrameSrc = resolvePlayerListFrame(outcome)

  return (
    <section
      className={PLAYER_LIST_WRAP_CLASS}
      aria-label="가면무도회 참가자 정체"
    >
      <PublicAsset
        src={playerListFrameSrc}
        alt=""
        aria-hidden="true"
        className={FRAME_SHADOW_LAYER_FILL_CLASS}
      />
      <PublicAsset
        src={playerListFrameSrc}
        alt=""
        className={FRAME_IMG_FILL_CLASS}
      />

      <div className={PLAYER_LIST_INSET_CLASS}>
        <h2 className={PLAYER_LIST_TITLE_CLASS}>가면무도회 참가자 정체</h2>
        <GameResultWinningTeamBadge winningTeam={winningTeam} />

        <div className={PLAYER_LIST_SCROLL_WRAP_CLASS}>
          <ul
            ref={scrollRef}
            className={PLAYER_LIST_SCROLL_CLASS}
          >
            {/* 내 줄은 isSelf로 따로 표시 */}
            {players.map((player) => (
              <GameResultPlayerRow
                key={player.id}
                {...player}
                isSelf={Boolean(selfUuid && player.id === selfUuid)}
              />
            ))}
          </ul>

          <Scrollbar
            scrollRef={scrollRef}
            alwaysVisible
            className={PLAYER_LIST_SCROLLBAR_CLASS}
          />
        </div>
      </div>
    </section>
  )
}
