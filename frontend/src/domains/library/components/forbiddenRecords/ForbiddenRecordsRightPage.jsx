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

/** 금지된 기록 — 우측 반페이지(핏자국/클리어 일러스트 + 도전과제) */
export default function ForbiddenRecordsRightPage({ pageIndex = 0, targetAchievementId = null }) {
  const { id, right } = getForbiddenRecordsPage(pageIndex)
  const { locked, unlockCondition, unlockProgress, unlockRewards, progressUnit, clearIllust, body } = right
  // F-12 AC-01/AC-06: 서버 업적 상태로 연결한다 — 이 spread의 id가 곧 achievementDefinitions.js의
  // 업적 id다(record-1-masquerade 등). 실제 진행률이 도착하면 그것으로 교체하고, 아직 한 번도
  // 불러온 적이 없는 최초 렌더에서만 정적 더미 진행도를 잠깐 보여준다 — 로딩 중이거나 조회가
  // 실패했을 때는 계정과 무관한 고정 더미 수치("1/3회 완료" 등)를 실제 진행률처럼 보여주면
  // 안 되므로(CODEX-1 AC-06 재검토), 그 두 상태는 별도 문구로 표시한다. 실제 계산은
  // resolveForbiddenRecordChallengeState.js(순수 함수, JSX 없음)로 뽑아 실행 기반으로
  // 검증한다(CODEX-2 재검토 AC-01/AC-06).
  const { achievements, status, error } = useAchievements()
  const achievement = achievements?.find((entry) => entry.id === id)
  const { challengeCleared, displayedProgress } = resolveForbiddenRecordChallengeState({
    achievement, status, error, unlockProgress, progressUnit,
  })
  const challengeClearIllustSrc =
    clearIllust ?? getForbiddenRecordsChallengeClearIllust(pageIndex + 1)

  // F-17(AC-02): 알림이 가리킨 업적과 **지금 실제로 렌더되는 페이지의 id**를 직접 대조한다
  // (매핑표를 믿지 않고 그 값을 쓰는 자리에서 확인한다). 표시만 바꾸고 진행률·지급에는
  // 관여하지 않는다.
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