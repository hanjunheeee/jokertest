// 결과 화면 MVP 칸: 명찰 틀("MVP 플레이어") + 카드 초상·이름
// board/ResultBoard가 씀, MVP 없으면 안 그림
import { GAME_RESULT_ASSETS, resolveMvpNameplateFrame } from "@/domains/game/result/constants/gameResultAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import CardPortrait from "../portrait/CardPortrait.jsx"

// MVP 칸 (명찰 틀은 승패 따라 바뀜)
export default function MvpCard({ outcome = "win", mvp }) {
    if (!mvp) return null

    return (
        <aside className="flex flex-col items-center" aria-label="MVP 플레이어">
            <div className="relative w-[min(70%,15rem)] land:w-[12rem] md:w-[17rem]">
                <PublicAsset
                    src={resolveMvpNameplateFrame(outcome)}
                    alt=""
                    className="block h-auto w-full select-none [filter:drop-shadow(0_6px_14px_rgba(0,0,0,0.8))]"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-[10%] pt-[3%] font-display text-[1.3rem] font-medium leading-none text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
                    MVP 플레이어
                </span>
            </div>
            <CardPortrait
                portraitSrc={mvp.portraitSrc}
                frameSrc={GAME_RESULT_ASSETS.mvpPlayerFrame}
                name={mvp.name}
                className="mt-2 w-[min(48%,11rem)] land:w-[8.5rem] md:w-[13rem]"
            />
        </aside>
    )
}
