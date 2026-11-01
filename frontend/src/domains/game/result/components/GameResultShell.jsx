// 결과 화면 본체: 배경·승패 띠·참가자 목록·MVP 칸, 차례로 나타남
// GameResultPage가 씀, 값은 실제 판(useGameResultData) 또는 미리보기
import { motion } from "framer-motion"
import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import {
  CONTENT_DROP_ANIMATE,
  CONTENT_DROP_INIT,
  CONTENT_DROP_TRANSITION,
  INNER_REVEAL_ANIMATE,
  INNER_REVEAL_DELAYS,
  INNER_REVEAL_INIT,
  INNER_REVEAL_TRANSITION,
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
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset"

// 결과 본체
export default function GameResultShell({
  outcome,
  winningTeam,
  players,
  selfUuid = null,
  mvp,
}) {
  // 배경도 승패 따라 바뀜
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
        initial={CONTENT_DROP_INIT}
        animate={CONTENT_DROP_ANIMATE}
        transition={CONTENT_DROP_TRANSITION}
      >
        {/* 띠 → 목록 → MVP 순서로 조금씩 늦게 나타남 */}
        <motion.div
          initial={INNER_REVEAL_INIT}
          animate={INNER_REVEAL_ANIMATE}
          transition={{
            ...INNER_REVEAL_TRANSITION,
            delay: INNER_REVEAL_DELAYS.banner,
          }}
        >
          <GameResultBanner outcome={outcome} />
        </motion.div>

        <div className={GAME_RESULT_BODY_CLASS}>
          <motion.div
            initial={INNER_REVEAL_INIT}
            animate={INNER_REVEAL_ANIMATE}
            transition={{
              ...INNER_REVEAL_TRANSITION,
              delay: INNER_REVEAL_DELAYS.playerList,
            }}
          >
            <GameResultPlayerList
              outcome={outcome}
              winningTeam={winningTeam}
              players={players}
              selfUuid={selfUuid}
            />
          </motion.div>
          {/* MVP 있을 때만 */}
          {mvp ? (
            <motion.div
              initial={INNER_REVEAL_INIT}
              animate={INNER_REVEAL_ANIMATE}
              transition={{
                ...INNER_REVEAL_TRANSITION,
                delay: INNER_REVEAL_DELAYS.mvp,
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
