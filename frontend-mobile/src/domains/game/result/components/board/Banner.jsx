// 결과 화면 맨 위 승리/패배 띠 (틀 그림 + 글자)
// board/ResultBoard가 씀
import { GAME_RESULT_ASSETS } from "@/domains/game/result/constants/gameResultAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 결과 글자 (모르는 값이면 승리로, 데스크톱과 같음)
const OUTCOME_LABELS = { win: "승리", lose: "패배" }

const SHADOW_CLASS =
    "[filter:drop-shadow(0_8px_18px_rgba(0,0,0,0.82))]"

// 승패 띠, 패배면 글자 색만 바꿈
export default function Banner({ outcome }) {
    const label = OUTCOME_LABELS[outcome] ?? OUTCOME_LABELS.win
    const tone = outcome === "lose" ? "text-[#d8d0c4]" : "text-[#f0d8a8]"

    return (
        <div className="relative mx-auto w-[min(76%,19rem)] land:w-[min(100%,15rem)] md:w-[22rem]">
            <PublicAsset
                src={GAME_RESULT_ASSETS.bannerFrame}
                alt=""
                className={`block h-auto w-full select-none ${SHADOW_CLASS}`}
            />
            <p
                className={`pointer-events-none absolute inset-0 flex items-center justify-center px-[14%] pt-[2%] pb-[1%] font-display text-[2.4rem] font-medium leading-none land:text-[2rem] md:text-[3rem] [text-shadow:0_2px_6px_rgba(0,0,0,0.75)] ${tone}`}
            >
                {label}
            </p>
        </div>
    )
}
