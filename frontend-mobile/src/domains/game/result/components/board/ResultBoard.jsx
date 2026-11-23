// 결과 화면 본체: 배경·승패 띠·참가자 목록 (모바일은 MVP 없음), 데스크톱과 같은 순서로 차례로 나타남
// pages/GameResultPage가 씀, 폰 세로는 한 열, 폰 가로·태블릿은 두 열(띠 | 목록)
import { motion } from "framer-motion"
import { GAME_RESULT_ASSETS } from "@/domains/game/result/constants/gameResultAssets.js"
import {
    CONTENT_DROP_ANIMATE,
    CONTENT_DROP_INIT,
    CONTENT_DROP_TRANSITION,
    INNER_REVEAL_ANIMATE,
    INNER_REVEAL_DELAYS,
    INNER_REVEAL_INIT,
    INNER_REVEAL_TRANSITION,
} from "@/domains/game/result/constants/gameResultEntranceMotion.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import Banner from "./Banner.jsx"
import PlayerList from "../players/PlayerList.jsx"

// 칸마다 늦춤만 다른 나타남 움직임
const reveal = (delay) => ({
    initial: INNER_REVEAL_INIT,
    animate: INNER_REVEAL_ANIMATE,
    transition: { ...INNER_REVEAL_TRANSITION, delay },
})

// 세로: 한 열, 가로·lg: 두 열
const GRID_CLASS =
    "mx-auto flex w-full max-w-[30rem] flex-col gap-3 px-4 pt-3 pb-2 md:max-w-[34rem] land:grid land:max-w-[52rem] land:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] land:items-start land:gap-5 land:px-5 lg:max-w-[60rem] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-10 lg:pt-6"

// 결과 본체 (배경도 승패 따라 바뀜)
export default function ResultBoard({ outcome, winningTeam, players, selfUuid = null }) {
    const bgSrc = outcome === "lose" ? GAME_RESULT_ASSETS.bgLose : GAME_RESULT_ASSETS.bgWin

    return (
        <div className="relative w-full">
            <motion.img
                src={publicAsset(bgSrc)}
                alt=""
                draggable={false}
                className="pointer-events-none fixed inset-0 h-full w-full select-none object-cover object-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={BG_FADE_TRANSITION}
            />
            <motion.div
                className={GRID_CLASS}
                initial={CONTENT_DROP_INIT}
                animate={CONTENT_DROP_ANIMATE}
                transition={CONTENT_DROP_TRANSITION}
            >
                <motion.div {...reveal(INNER_REVEAL_DELAYS.banner)} className="shrink-0 land:sticky land:top-3 lg:sticky lg:top-6">
                    <Banner outcome={outcome} />
                </motion.div>
                <motion.div {...reveal(INNER_REVEAL_DELAYS.playerList)} className="w-full">
                    <PlayerList outcome={outcome} winningTeam={winningTeam} players={players} selfUuid={selfUuid} />
                </motion.div>
            </motion.div>
        </div>
    )
}