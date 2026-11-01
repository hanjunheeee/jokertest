// 이긴 진영 배지 ("시민 진영 승리"/"광대 진영 승리")
// players/PlayerList가 씀, 진영 모르면 안 그림
import { resolveWinningTeamLabel } from "@/domains/game/result/constants/gameResultLabels.js"

const BADGE_CLASS =
    "inline-flex items-center justify-center rounded-full border px-3.5 py-1 font-subheading text-sm font-bold leading-none tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 진영별 색 (데스크톱과 같은 색)
const TONE = {
    JOKER: "border-[#c87878]/85 bg-[#2a1212]/85 text-[#f0c8c8]",
    CITIZEN: "border-[#8fa8c8]/85 bg-[#152033]/85 text-[#d4e6ff]",
}

// 이긴 진영 배지 (광대면 붉은 색)
export default function WinningTeamBadge({ winningTeam }) {
    const label = resolveWinningTeamLabel(winningTeam)
    if (!label) return null

    return (
        <div className="mb-3 flex justify-center">
            <span className={`${BADGE_CLASS} ${winningTeam === "JOKER" ? TONE.JOKER : TONE.CITIZEN}`}>
                {label}
            </span>
        </div>
    )
}
