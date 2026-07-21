import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import {
  GAME_RESULT_BODY_CLASS,
  GAME_RESULT_BG_CLASS,
  GAME_RESULT_PAGE_CLASS,
  GAME_RESULT_SHELL_CLASS,
} from "../constants/gameResultLayout.js"
import GameResultBanner from "./GameResultBanner.jsx"
import GameResultMvpPanel from "./GameResultMvpPanel.jsx"
import GameResultPlayerList from "./GameResultPlayerList.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

/** 게임 결과 화면 — 배경 + 승패 배너 + 플레이어 목록 + MVP */
export default function GameResultShell({ outcome, players, mvp }) {
  const bgSrc =
    outcome === "lose" ? GAME_RESULT_ASSETS.bgLose : GAME_RESULT_ASSETS.bgWin

  return (
    <div className={GAME_RESULT_PAGE_CLASS}>
      <img
        src={publicAsset(bgSrc)}
        alt=""
        className={GAME_RESULT_BG_CLASS}
        draggable={false}
      />

      <div className={GAME_RESULT_SHELL_CLASS}>
        <GameResultBanner outcome={outcome} />

        <div className={GAME_RESULT_BODY_CLASS}>
          <GameResultPlayerList outcome={outcome} players={players} />
          <GameResultMvpPanel outcome={outcome} mvp={mvp} />
        </div>
      </div>
    </div>
  )
}