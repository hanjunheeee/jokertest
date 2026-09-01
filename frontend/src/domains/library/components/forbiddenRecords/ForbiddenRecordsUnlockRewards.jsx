import {
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_COUNT_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_ICON_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_ITEM_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_LABEL_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_ROW_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_STACK_CLASS,
} from "@/domains/library/constants/forbiddenRecords/layoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 금지된 기록 — 해금 보상 (인게임 재화 아이콘 + 수량) */
export default function ForbiddenRecordsUnlockRewards({ rewards }) {
  if (!rewards?.length) return null

  return (
    <div className={LIBRARY_FORBIDDEN_UNLOCK_REWARD_STACK_CLASS}>
      <p className={LIBRARY_FORBIDDEN_UNLOCK_REWARD_LABEL_CLASS}>보상</p>
      <div className={LIBRARY_FORBIDDEN_UNLOCK_REWARD_ROW_CLASS}>
        {rewards.map((reward) => (
          <div key={reward.icon} className={LIBRARY_FORBIDDEN_UNLOCK_REWARD_ITEM_CLASS}>
            <PublicAsset src={reward.icon} alt="" className={LIBRARY_FORBIDDEN_UNLOCK_REWARD_ICON_CLASS} />
            <span className={LIBRARY_FORBIDDEN_UNLOCK_REWARD_COUNT_CLASS}>×{reward.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
