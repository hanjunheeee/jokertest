import { motion } from "framer-motion"
import { useAchievements } from "../../../../domains/library/hooks/useAchievements.js"
import { resolveForbiddenRecordChallengeState } from "../../../../domains/library/content/forbiddenRecords/resolveForbiddenRecordChallengeState.js"
import { getForbiddenRecordsPage } from "../../../../domains/library/content/forbiddenRecords/index.js"
import { FORBIDDEN_RECORDS_ASSETS, getForbiddenRecordsChallengeClearIllust } from "../../../../domains/library/constants/forbiddenRecords/assets.js"
import ForbiddenRecordsUnlockCondition from "../../../../domains/library/components/forbiddenRecords/ForbiddenRecordsUnlockCondition.js"
import {
  FORBIDDEN_BLOOD_SPREAD_ANIMATE,
  FORBIDDEN_BLOOD_SPREAD_INITIAL,
  FORBIDDEN_BLOOD_SPREAD_ORIGIN,
  FORBIDDEN_BLOOD_SPREAD_TRANSITION,
  FORBIDDEN_UNLOCK_REVEAL_ANIMATE,
  FORBIDDEN_UNLOCK_REVEAL_INITIAL,
  FORBIDDEN_UNLOCK_REVEAL_TRANSITION,
} from "../../../../domains/library/constants/forbiddenRecords/entranceMotion.js"
import {
  LIBRARY_BOOK_RIGHT_PAGE_CLASS,
  LIBRARY_BOOK_RIGHT_PAGE_LOCKED_CLASS,
  LIBRARY_FORBIDDEN_BLOOD_CLASS,
  LIBRARY_FORBIDDEN_LOCK_LAYER_CLASS,
  LIBRARY_FORBIDDEN_UNLOCKED_BODY_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_LAYER_CLASS,
} from "../../../../domains/library/constants/forbiddenRecords/layoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset"

const MotionPublicAsset = motion.create(PublicAsset)

function ForbiddenRecordsOverlayArt({ pageIndex, src }) {
  return (
    <MotionPublicAsset
      key={`overlay-${pageIndex}-${src}`}
      src={src}
      alt=""
      className={LIBRARY_FORBIDDEN_BLOOD_CLASS}
      initial={FORBIDDEN_BLOOD_SPREAD_INITIAL}
      animate={FORBIDDEN_BLOOD_SPREAD_ANIMATE}
      transition={FORBIDDEN_BLOOD_SPREAD_TRANSITION}
      style={{ transformOrigin: FORBIDDEN_BLOOD_SPREAD_ORIGIN }}
    />
  )
}

export default function ForbiddenRecordsRightPage({ pageIndex = 0, targetAchievementId = null }) {
  const { id, right } = getForbiddenRecordsPage(pageIndex)
  const { locked, unlockCondition, unlockProgress, unlockRewards, progressUnit, clearIllust, body } = right
  const { achievements, status, error } = useAchievements()
  const achievement = achievements?.find((entry) => entry.id === id)
  const { challengeCleared, displayedProgress } = resolveForbiddenRecordChallengeState({
    achievement, status, error, unlockProgress, progressUnit,
  })
  const challengeClearIllustSrc =
    clearIllust ?? getForbiddenRecordsChallengeClearIllust(pageIndex + 1)

  const targeted = targetAchievementId !== null && targetAchievementId === id
  const pageMarkers = {
    "data-record-id": id,
    "data-notification-target": targeted ? "true" : undefined,
  }

  if (!locked) {
    return (
      <div className={LIBRARY_BOOK_RIGHT_PAGE_CLASS} {...pageMarkers}>
        <p className={LIBRARY_FORBIDDEN_UNLOCKED_BODY_CLASS}>
          {body ?? "해금된 기록 본문이 이 영역에 표시됩니다."}
        </p>
      </div>
    )
  }

  if (challengeCleared) {
    return (
      <div className={LIBRARY_BOOK_RIGHT_PAGE_LOCKED_CLASS} {...pageMarkers}>
        <div className={LIBRARY_FORBIDDEN_LOCK_LAYER_CLASS}>
          <ForbiddenRecordsOverlayArt
            pageIndex={pageIndex}
            src={challengeClearIllustSrc}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={LIBRARY_BOOK_RIGHT_PAGE_LOCKED_CLASS} {...pageMarkers}>
      <div className={LIBRARY_FORBIDDEN_LOCK_LAYER_CLASS}>
        <ForbiddenRecordsOverlayArt pageIndex={pageIndex} src={FORBIDDEN_RECORDS_ASSETS.bloodStain} />
        <motion.div
          key={`unlock-${pageIndex}`}
          className={LIBRARY_FORBIDDEN_UNLOCK_LAYER_CLASS}
          initial={FORBIDDEN_UNLOCK_REVEAL_INITIAL}
          animate={FORBIDDEN_UNLOCK_REVEAL_ANIMATE}
          transition={FORBIDDEN_UNLOCK_REVEAL_TRANSITION}
        >
          <ForbiddenRecordsUnlockCondition
            condition={unlockCondition}
            progress={displayedProgress}
            rewards={unlockRewards}
          />
        </motion.div>
      </div>
    </div>
  )
}