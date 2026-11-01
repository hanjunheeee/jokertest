// 도전과제 보상 묶음 (재화는 아이콘·개수, 테두리는 누르면 크게 보기)
// guests/ChallengeList.jsx가 씀, 글자·아이콘 모양은 데스크톱과 같은 값
import {
  REWARD_BORDER_ICON_CLASS,
  REWARD_BORDER_LABEL_CLASS,
  REWARD_COUNT_CLASS,
  REWARD_ICON_CLASS,
} from "@m/domains/library/constants/guestsStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 테두리 버튼은 누르는 자리 44px 이상
const BORDER_BTN_CLASS =
  "inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-[#2a1810]/16 bg-[#f5f0e6]/40 px-2.5 leading-none transition-transform duration-150 active:scale-95"

// 보상 종류마다 다른 모양, 테두리를 누르면 위로 알려 시트를 엶
export default function ChallengeRewards({ rewards, onOpenBorder }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {rewards.map((reward, index) =>
        reward.type === "currency" ? (
          <span key={`${reward.icon}-${index}`} className="flex items-center gap-0.5">
            <PublicAsset src={reward.icon} alt="" className={REWARD_ICON_CLASS} />
            <span className={REWARD_COUNT_CLASS}>×{reward.count}</span>
          </span>
        ) : (
          <button
            key={`${reward.icon}-${index}`}
            type="button"
            className={BORDER_BTN_CLASS}
            aria-label={`${reward.label} 크게 보기`}
            onClick={() => onOpenBorder(reward)}
          >
            <PublicAsset src={reward.icon} alt="" className={REWARD_BORDER_ICON_CLASS} />
            <span className={`${REWARD_BORDER_LABEL_CLASS} text-left`}>{reward.label}</span>
          </button>
        ),
      )}
    </div>
  )
}
