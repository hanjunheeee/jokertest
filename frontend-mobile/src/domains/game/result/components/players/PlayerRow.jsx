// 결과 목록 한 줄: 프로필·이름·직업, 내 줄이면 "내 정보" 배지·받은 판 골드("+1골드")와 밝은 강조, 남의 줄은 오른쪽 끝 덧붙임(신고 버튼) 자리
// players/PlayerList가 씀
import { SELF_INFO_BADGE_LABEL, formatGoldRewardLabel } from "@/domains/game/result/constants/gameResultLabels.js"
import { PLAYER_ROW_INNER_SELF_CLASS } from "@/domains/game/result/constants/gameResultLayout.js"
import ProfilePortrait from "@m/shared/ui/portrait/ProfilePortrait.jsx"

const ROW_CLASS =
    "flex min-h-14 items-center gap-2 rounded-sm border px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
const ROW_TONE = "border-[#3a2818]/75 bg-[#120a06]/60"

// 참가자 한 줄 (긴 이름은 말줄임, 직업은 오른쪽 고정)
export default function PlayerRow({ name, job, profilePhotoSrc, profileBorderSrc, isSelf = false, goldReward = 0, trailing = null }) {
    // 판 골드는 내 줄에만 (모두 같은 값이라 내 것 하나, 못 받았으면 안 보임)
    const goldLabel = isSelf ? formatGoldRewardLabel(goldReward) : null
    const text = isSelf ? "text-black" : "text-white"
    const jobText = isSelf ? "text-black" : "text-[#c8a878] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

    return (
        <li className="list-none">
            <div className={`${ROW_CLASS} ${isSelf ? PLAYER_ROW_INNER_SELF_CLASS : ROW_TONE}`}>
                <ProfilePortrait photoSrc={profilePhotoSrc} frameSrc={profileBorderSrc} className="size-14" spot="raised" />
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {isSelf ? (
                        <span className="shrink-0 rounded-full border border-black/35 bg-black/10 px-2 py-0.5 font-subheading text-[0.7rem] font-bold leading-none text-black">
                            {SELF_INFO_BADGE_LABEL}
                        </span>
                    ) : null}
                    <p className={`min-w-0 flex-1 truncate font-subheading text-base font-bold leading-tight ${text}`}>
                        {name}
                    </p>
                </div>
                <span className={`shrink-0 pr-1 font-subheading text-[0.95rem] font-bold leading-none ${jobText}`}>
                    {job}
                </span>
                {goldLabel ? (
                    <span className="shrink-0 rounded-full border border-black/35 bg-[#f5d36b]/80 px-2 py-0.5 font-subheading text-[0.75rem] font-bold leading-none text-black" data-testid="game-result-gold-reward">
                        {goldLabel}
                    </span>
                ) : null}
                {trailing}
            </div>
        </li>
    )
}
