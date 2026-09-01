import { motion } from "framer-motion"
import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import {
  GAME_RESULT_CONTENT_DROP_ANIMATE,
  GAME_RESULT_CONTENT_DROP_INITIAL,
  GAME_RESULT_CONTENT_DROP_TRANSITION,
  GAME_RESULT_INNER_REVEAL_ANIMATE,
  GAME_RESULT_INNER_REVEAL_DELAYS,
  GAME_RESULT_INNER_REVEAL_INITIAL,
  GAME_RESULT_INNER_REVEAL_TRANSITION,
} from "../constants/gameResultEntranceMotion.js"
import {
  GAME_RESULT_BODY_CLASS,
  GAME_RESULT_BG_CLASS,
  GAME_RESULT_PAGE_CLASS,
  GAME_RESULT_SHELL_CLASS,
} from "../constants/gameResultLayout.js"
import GameResultBanner from "./GameResultBanner.jsx"
import GameResultMvpPanel from "./GameResultMvpPanel.jsx"
import GameResultPlayerList from "./GameResultPlayerList.jsx"
import GameResultRosterStrip from "./GameResultRosterStrip.jsx"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset"

/** 게임 결과 화면 — 배경 + 승패 배너 + 본인 캐릭터 + 플레이어 목록 + MVP */
export default function GameResultShell({
  outcome,
  winningTeam,
  players,
  rosterPlayers = [],
  mvp,
}) {
  const bgSrc =
    outcome === "lose" ? GAME_RESULT_ASSETS.bgLose : GAME_RESULT_ASSETS.bgWin

  return (
    <div className={GAME_RESULT_PAGE_CLASS}>
      <motion.img
        src={publicAsset(bgSrc)}
        alt=""
        className={GAME_RESULT_BG_CLASS}
        draggable={false}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
      />

      <motion.div
        className={GAME_RESULT_SHELL_CLASS}
        initial={GAME_RESULT_CONTENT_DROP_INITIAL}
        animate={GAME_RESULT_CONTENT_DROP_ANIMATE}
        transition={GAME_RESULT_CONTENT_DROP_TRANSITION}
      >
        <motion.div
          initial={GAME_RESULT_INNER_REVEAL_INITIAL}
          animate={GAME_RESULT_INNER_REVEAL_ANIMATE}
          transition={{
            ...GAME_RESULT_INNER_REVEAL_TRANSITION,
            delay: GAME_RESULT_INNER_REVEAL_DELAYS.banner,
          }}
        >
          <GameResultBanner outcome={outcome} />
        </motion.div>

        <motion.div
          initial={GAME_RESULT_INNER_REVEAL_INITIAL}
          animate={GAME_RESULT_INNER_REVEAL_ANIMATE}
          transition={{
            ...GAME_RESULT_INNER_REVEAL_TRANSITION,
            delay: GAME_RESULT_INNER_REVEAL_DELAYS.roster,
          }}
        >
          <GameResultRosterStrip players={rosterPlayers} />
        </motion.div>

        <div className={GAME_RESULT_BODY_CLASS}>
          <motion.div
            initial={GAME_RESULT_INNER_REVEAL_INITIAL}
            animate={GAME_RESULT_INNER_REVEAL_ANIMATE}
            transition={{
              ...GAME_RESULT_INNER_REVEAL_TRANSITION,
              delay: GAME_RESULT_INNER_REVEAL_DELAYS.playerList,
            }}
          >
            <GameResultPlayerList
              outcome={outcome}
              winningTeam={winningTeam}
              players={players}
            />
          </motion.div>
          {mvp ? (
            <motion.div
              initial={GAME_RESULT_INNER_REVEAL_INITIAL}
              animate={GAME_RESULT_INNER_REVEAL_ANIMATE}
              transition={{
                ...GAME_RESULT_INNER_REVEAL_TRANSITION,
                delay: GAME_RESULT_INNER_REVEAL_DELAYS.mvp,
              }}
            >
              <GameResultMvpPanel outcome={outcome} mvp={mvp} />
            </motion.div>
          ) : null}
        </div>
      </motion.div>
    </div>
  )
}
