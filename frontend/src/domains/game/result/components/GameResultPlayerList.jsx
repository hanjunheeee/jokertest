import { useRef } from "react"
import { resolveGameResultPlayerListFrame } from "../constants/gameResultAssets.js"
import {
  GAME_RESULT_FRAME_IMAGE_FILL_CLASS,
  GAME_RESULT_FRAME_SHADOW_LAYER_FILL_CLASS,
  GAME_RESULT_PLAYER_LIST_INSET_CLASS,
  GAME_RESULT_PLAYER_LIST_SCROLL_CLASS,
  GAME_RESULT_PLAYER_LIST_SCROLL_WRAP_CLASS,
  GAME_RESULT_PLAYER_LIST_TITLE_CLASS,
  GAME_RESULT_PLAYER_LIST_WRAP_CLASS,
} from "../constants/gameResultLayout.js"
import GameResultPlayerRow from "./GameResultPlayerRow.jsx"
import GameResultWinningTeamBadge from "./GameResultWinningTeamBadge.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function GameResultPlayerList({
  outcome = "win",
  winningTeam = null,
  players = [],
}) {
  const scrollRef = useRef(null)
  const playerListFrameSrc = resolveGameResultPlayerListFrame(outcome)

  return (
    <section
      className={GAME_RESULT_PLAYER_LIST_WRAP_CLASS}
      aria-label="가면무도회 참가자 정체"
    >
      <PublicAsset
        src={playerListFrameSrc}
        alt=""
        aria-hidden="true"
        className={GAME_RESULT_FRAME_SHADOW_LAYER_FILL_CLASS}
      />
      <PublicAsset
        src={playerListFrameSrc}
        alt=""
        className={GAME_RESULT_FRAME_IMAGE_FILL_CLASS}
      />

      <div className={GAME_RESULT_PLAYER_LIST_INSET_CLASS}>
        <h2 className={GAME_RESULT_PLAYER_LIST_TITLE_CLASS}>가면무도회 참가자 정체</h2>
        <GameResultWinningTeamBadge winningTeam={winningTeam} />

        <div className={GAME_RESULT_PLAYER_LIST_SCROLL_WRAP_CLASS}>
          <ul
            ref={scrollRef}
            className={GAME_RESULT_PLAYER_LIST_SCROLL_CLASS}
          >
            {players.map((player) => (
              <GameResultPlayerRow key={player.id} {...player} />
            ))}
          </ul>

          <Scrollbar scrollRef={scrollRef} />
        </div>
      </div>
    </section>
  )
}
