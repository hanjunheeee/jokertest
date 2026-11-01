import { motion } from "framer-motion"
import { useAchievements } from "../../../../domains/library/hooks/useAchievements.js"
import { resolveForbiddenRecordChallengeState } from "../../../../domains/library/content/forbiddenRecords/resolveForbiddenRecordChallengeState.js"
import { getForbiddenRecordsPage } from "../../../../domains/library/content/forbiddenRecords/index.js"
import { FORBIDDEN_ASSETS, getForbiddenRecordsChallengeClearIllust } from "../../../../domains/library/constants/forbiddenRecords/assets.js"
import ForbiddenRecordsUnlockCondition from "../../../../domains/library/components/forbiddenRecords/ForbiddenRecordsUnlockCondition.js"
import {
  BLOOD_SPREAD_ANIMATE,
  BLOOD_SPREAD_INIT,
  BLOOD_SPREAD_ORIGIN,
  BLOOD_SPREAD_TRANSITION,
  UNLOCK_REVEAL_ANIMATE,
  UNLOCK_REVEAL_INIT,
  UNLOCK_REVEAL_TRANSITION,
} from "../../../../domains/library/constants/forbiddenRecords/entranceMotion.js"
import {
  BOOK_RIGHT_PAGE_CLASS,
  BOOK_RIGHT_PAGE_LOCKED_CLASS,
  BLOOD_CLASS,
  LOCK_LAYER_CLASS,
  UNLOCKED_BODY_CLASS,
  UNLOCK_LAYER_CLASS,
} from "../../../../domains/library/constants/forbiddenRecords/layoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset"

const MotionPublicAsset = motion.create(PublicAsset)

function ForbiddenRecordsOverlayArt({ pageIndex, src }) {
  return (
    <MotionPublicAsset
      key={`overlay-${pageIndex}-${src}`}
      src={src}
      alt=""
      className={BLOOD_CLASS}
      initial={BLOOD_SPREAD_INIT}
      animate={BLOOD_SPREAD_ANIMATE}
      transition={BLOOD_SPREAD_TRANSITION}
      style={{ transformOrigin: BLOOD_SPREAD_ORIGIN }}
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
      <div className={BOOK_RIGHT_PAGE_CLASS} {...pageMarkers}>
        <p className={UNLOCKED_BODY_CLASS}>
          {body ?? "해금된 기록 본문이 이 영역에 표시됩니다."}
        </p>
      </div>
    )
  }

  if (challengeCleared) {
    return (
      <div className={BOOK_RIGHT_PAGE_LOCKED_CLASS} {...pageMarkers}>
        <div className={LOCK_LAYER_CLASS}>
          <ForbiddenRecordsOverlayArt
            pageIndex={pageIndex}
            src={challengeClearIllustSrc}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={BOOK_RIGHT_PAGE_LOCKED_CLASS} {...pageMarkers}>
      <div className={LOCK_LAYER_CLASS}>
        <ForbiddenRecordsOverlayArt pageIndex={pageIndex} src={FORBIDDEN_ASSETS.bloodStain} />
        <motion.div
          key={`unlock-${pageIndex}`}
          className={UNLOCK_LAYER_CLASS}
          initial={UNLOCK_REVEAL_INIT}
          animate={UNLOCK_REVEAL_ANIMATE}
          transition={UNLOCK_REVEAL_TRANSITION}
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