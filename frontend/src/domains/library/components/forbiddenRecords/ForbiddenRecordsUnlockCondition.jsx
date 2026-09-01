import ForbiddenRecordsUnlockRewards from "@/domains/library/components/forbiddenRecords/ForbiddenRecordsUnlockRewards.jsx"
import {
  LIBRARY_FORBIDDEN_UNLOCK_BRACKET_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_CHALLENGE_GROUP_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_CONDITION_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_LABEL_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_STACK_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_VALUE_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_ROW_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_STACK_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_SUFFIX_CLASS,
} from "@/domains/library/constants/forbiddenRecords/layoutStyle.js"

/** 금지된 기록 — 해금 조건 (대괄호 + 조건 + 시 해금 + 진행도 + 보상) */
export default function ForbiddenRecordsUnlockCondition({ condition, progress, rewards }) {
  return (
    <div className={LIBRARY_FORBIDDEN_UNLOCK_STACK_CLASS}>
      <div className={LIBRARY_FORBIDDEN_UNLOCK_CHALLENGE_GROUP_CLASS}>
        <div className={LIBRARY_FORBIDDEN_UNLOCK_ROW_CLASS}>
          <span className={LIBRARY_FORBIDDEN_UNLOCK_BRACKET_CLASS} aria-hidden="true">
            [
          </span>
          <span className={LIBRARY_FORBIDDEN_UNLOCK_CONDITION_CLASS}>{condition}</span>
          <span className={LIBRARY_FORBIDDEN_UNLOCK_BRACKET_CLASS} aria-hidden="true">
            ]
          </span>
        </div>
        <p className={LIBRARY_FORBIDDEN_UNLOCK_SUFFIX_CLASS}>시 해금</p>
        {progress ? (
          <div className={LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_STACK_CLASS}>
            <p className={LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_LABEL_CLASS}>현재 진행도</p>
            <p className={LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_VALUE_CLASS}>{progress}</p>
          </div>
        ) : null}
      </div>
      <ForbiddenRecordsUnlockRewards rewards={rewards} />
    </div>
  )
}
