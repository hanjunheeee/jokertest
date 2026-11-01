// 잠긴 기록 해금 조건·진행도·보상 묶음 ([조건] 시 해금)
// forbidden/LockPage.jsx가 씀, 글자 모양은 데스크톱과 같은 값 (constants/unlockStyle.js)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  PROGRESS_LABEL_CLASS,
  PROGRESS_STACK_CLASS,
  PROGRESS_VALUE_CLASS,
  REWARD_COUNT_CLASS,
  REWARD_ICON_CLASS,
  REWARD_ITEM_CLASS,
  REWARD_ROW_CLASS,
  REWARD_STACK_CLASS,
  UNLOCK_BRACKET_CLASS,
  UNLOCK_CONDITION_CLASS,
  UNLOCK_GROUP_CLASS,
  UNLOCK_ROW_CLASS,
  UNLOCK_STACK_CLASS,
  UNLOCK_SUFFIX_CLASS,
} from "@m/domains/library/constants/unlockStyle.js"

// 진행도 글자 없으면 진행도 줄, 보상 없으면 보상 줄 뺌
export default function UnlockCondition({ condition, progress, rewards }) {
  return (
    <div className={UNLOCK_STACK_CLASS}>
      <div className={UNLOCK_GROUP_CLASS}>
        <div className={UNLOCK_ROW_CLASS}>
          <span className={UNLOCK_BRACKET_CLASS} aria-hidden="true">[</span>
          <span className={UNLOCK_CONDITION_CLASS}>{condition}</span>
          <span className={UNLOCK_BRACKET_CLASS} aria-hidden="true">]</span>
        </div>
        <p className={`m-0 ${UNLOCK_SUFFIX_CLASS}`}>시 해금</p>
        {progress ? (
          <div className={PROGRESS_STACK_CLASS}>
            <p className={`m-0 ${PROGRESS_LABEL_CLASS}`}>현재 진행도</p>
            <p className={`m-0 ${PROGRESS_VALUE_CLASS}`}>{progress}</p>
          </div>
        ) : null}
      </div>
      {rewards?.length ? (
        <div className={REWARD_STACK_CLASS}>
          <p className={`m-0 ${PROGRESS_LABEL_CLASS}`}>보상</p>
          <div className={REWARD_ROW_CLASS}>
            {rewards.map((reward) => (
              <div key={reward.icon} className={REWARD_ITEM_CLASS}>
                <PublicAsset src={reward.icon} alt="" className={REWARD_ICON_CLASS} />
                <span className={REWARD_COUNT_CLASS}>×{reward.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
