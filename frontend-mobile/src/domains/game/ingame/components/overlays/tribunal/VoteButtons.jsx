// 재판 유죄·무죄 그림 버튼 둘 (튀어나오는 움직임은 데스크톱 값 그대로)
// 재판 연출 창(TribunalOverlay)이 씀
import { motion, useReducedMotion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset"
import {
    TRIBUNAL_VOTE_GUILTY_LABEL,
    TRIBUNAL_VOTE_NOT_GUILTY_LABEL,
} from "@/domains/game/ingame/constants/actions/ingameActionPanel.js"
import { PLAYER_CARD_OVERLAY_ASSETS } from "@/domains/game/ingame/constants/board/ingamePlayerCardOverlayAssets.js"
import { BTN_MOTION } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationMotion.js"

const BTN_CLASS =
    "relative block min-h-11 w-[7rem] max-w-[48%] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 md:w-[8rem]"

const LABEL_CLASS =
    "pointer-events-none absolute inset-0 flex items-center justify-center pb-[3%] font-subheading text-[1rem] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

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
            variants={BTN_MOTION}
            initial={reduced ? false : "hidden"}
            animate={reduced ? undefined : "visible"}
            custom={delay}
        >
            <PublicAsset src={src} alt="" className="block h-full w-full select-none object-fill" />
            <span className={LABEL_CLASS}>{label}</span>
        </motion.button>
    )
}

// 유죄는 취소 그림, 무죄는 수락 그림 (데스크톱과 같음)
export default function VoteButtons({ disabled, onGuilty, onNotGuilty }) {
    return (
        <div className="flex w-full flex-row items-stretch justify-center gap-2.5">
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
        </div>
    )
}
