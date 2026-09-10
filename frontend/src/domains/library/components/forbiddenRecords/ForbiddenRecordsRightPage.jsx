import { motion } from "framer-motion"
import { useAchievements } from "../../../../domains/library/hooks/useAchievements.js"
import { getForbiddenRecordsPage } from "../../../../domains/library/content/forbiddenRecords/index.js"
import { FORBIDDEN_RECORDS_ASSETS, getForbiddenRecordsChallengeClearIllust } from "../../../../domains/library/constants/forbiddenRecords/assets.js"
import ForbiddenRecordsUnlockCondition from "../../../../domains/library/components/forbiddenRecords/ForbiddenRecordsUnlockCondition.jsx"
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

/** 금지된 기록 — 우측 반페이지(핏자국/클리어 일러스트 + 도전과제) */
export default function ForbiddenRecordsRightPage({ pageIndex = 0 }) {
  const { id, right } = getForbiddenRecordsPage(pageIndex)
  const { locked, unlockCondition, unlockProgress, unlockRewards, progressUnit, clearIllust, body } = right
  // F-12 AC-01/AC-06: 서버 업적 상태로 연결한다 — 이 spread의 id가 곧 achievementDefinitions.js의
  // 업적 id다(record-1-masquerade 등). 아직 불러오는 중이면(achievements === null) 정적 더미
  // 진행도로 안전하게 표시하고, 도착하면 실제 진행률·달성 여부로 교체한다.
  const { achievements } = useAchievements()
  const achievement = achievements?.find((entry) => entry.id === id)
  const challengeCleared = achievement?.achieved ?? false
  const displayedProgress = achievement
    ? `${Math.min(achievement.current, achievement.threshold)}/${achievement.threshold}${progressUnit ?? ""}`
    : unlockProgress
  const challengeClearIllustSrc =
    clearIllust ?? getForbiddenRecordsChallengeClearIllust(pageIndex + 1)

  if (!locked) {
    return (
      <div className={LIBRARY_BOOK_RIGHT_PAGE_CLASS}>
        <p className={LIBRARY_FORBIDDEN_UNLOCKED_BODY_CLASS}>
          {body ?? "해금된 기록 본문이 이 영역에 표시됩니다."}
        </p>
      </div>
    )
  }

  if (challengeCleared) {
    return (
      <div className={LIBRARY_BOOK_RIGHT_PAGE_LOCKED_CLASS}>
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
    <div className={LIBRARY_BOOK_RIGHT_PAGE_LOCKED_CLASS}>
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