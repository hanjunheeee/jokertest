// 재판 유죄·무죄 그림 버튼 둘 (나타나는 움직임·늦춤·그림·글자 모양은 데스크톱 값 그대로)
// 재판 버튼 칸(TribunalActions)이 씀
import { motion, useReducedMotion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset"
import {
    TRIBUNAL_VOTE_GUILTY_LABEL,
    TRIBUNAL_VOTE_NOT_GUILTY_LABEL,
} from "@/domains/game/ingame/constants/actions/ingameActionPanel.js"
import { PLAYER_CARD_OVERLAY_ASSETS } from "@/domains/game/ingame/constants/board/ingamePlayerCardOverlayAssets.js"
import {
    ACTION_BTN_IMG_CLASS,
    ACTION_BTN_LABEL_CLASS,
    ACTIONS_CLASS,
} from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js"
import { BTN_MOTION } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationMotion.js"

// 데스크톱 폭(7.5rem·최대 46%), 그림 높이가 36px라 위아래를 투명하게 늘려 누르는 자리 44px
const BTN_CLASS =
    "relative flex min-h-11 w-[7.5rem] max-w-[46%] shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 leading-none transition-opacity active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 md:w-[8.5rem]"

// 그림 버튼 하나, 나타나는 늦춤은 delay
function VoteButton({ label, src, disabled, onClick, delay }) {
    const reduced = useReducedMotion()
    return (
        <motion.button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={BTN_CLASS}
            style={{ outline: "none" }}
            variants={BTN_MOTION}
            initial={reduced ? false : "hidden"}
            animate={reduced ? undefined : "visible"}
            custom={delay}
        >
            <PublicAsset src={src} alt="" className={ACTION_BTN_IMG_CLASS} />
            <span className={ACTION_BTN_LABEL_CLASS}>{label}</span>
        </motion.button>
    )
}

// 유죄는 취소 그림, 무죄는 수락 그림, 묶음은 0.12초 뒤 서서히 나타남 (데스크톱과 같음)
export default function VoteButtons({ disabled, onGuilty, onNotGuilty }) {
    const reduced = useReducedMotion()
    return (
        <motion.div
            className={ACTIONS_CLASS}
            initial={reduced ? false : { opacity: 0 }}
            animate={reduced ? undefined : { opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.12, duration: 0.18 }}
        >
            <VoteButton
                label={TRIBUNAL_VOTE_GUILTY_LABEL}
                src={PLAYER_CARD_OVERLAY_ASSETS.cancelButton}
                disabled={disabled}
                onClick={() => onGuilty?.()}
                delay={0.16}
            />
            <VoteButton
                label={TRIBUNAL_VOTE_NOT_GUILTY_LABEL}
                src={PLAYER_CARD_OVERLAY_ASSETS.confirmButton}
                disabled={disabled}
                onClick={() => onNotGuilty?.()}
                delay={0.28}
            />
        </motion.div>
    )
}
