import {
  INVITED_GUESTS_REWARD_BORDER_BUTTON_CLASS,
  INVITED_GUESTS_REWARD_BORDER_ICON_CLASS,
  INVITED_GUESTS_REWARD_BORDER_LABEL_CLASS,
  INVITED_GUESTS_REWARD_COUNT_CLASS,
  INVITED_GUESTS_REWARD_CURRENCY_CLASS,
  INVITED_GUESTS_REWARD_ICON_CLASS,
  INVITED_GUESTS_REWARD_ROW_CLASS,
} from "@/domains/library/constants/invitedGuests/layoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function InvitedGuestsChallengeRewards({ rewards, onOpenProfileBorderZoom }) {
  return (
    <div className={INVITED_GUESTS_REWARD_ROW_CLASS}>
      {rewards.map((reward, index) => {
        if (reward.type === "currency") {
          return (
            <span key={`${reward.icon}-${index}`} className={INVITED_GUESTS_REWARD_CURRENCY_CLASS}>
              <PublicAsset src={reward.icon} alt="" className={INVITED_GUESTS_REWARD_ICON_CLASS} />
              <span className={INVITED_GUESTS_REWARD_COUNT_CLASS}>×{reward.count}</span>
            </span>
          )
        }

        return (
          <button
            key={`${reward.icon}-${index}`}
            type="button"
            className={INVITED_GUESTS_REWARD_BORDER_BUTTON_CLASS}
            style={{ outline: "none" }}
            aria-label={`${reward.label} 크게 보기`}
            onClick={() => onOpenProfileBorderZoom?.(reward)}
          >
            <PublicAsset src={reward.icon} alt="" className={INVITED_GUESTS_REWARD_BORDER_ICON_CLASS} />
            <span className={INVITED_GUESTS_REWARD_BORDER_LABEL_CLASS}>{reward.label}</span>
          </button>
        )
      })}
    </div>
  )
}
