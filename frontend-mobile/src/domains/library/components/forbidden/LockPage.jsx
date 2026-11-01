// 금지된 기록 뒷면 (풀린 본문 / 깬 기록 일러스트 / 핏자국 위 해금 조건)
// forbidden/ForbiddenRecordsView.jsx가 씀, 상태 계산은 데스크톱 content 함수
import { motion } from "framer-motion"
import { resolveForbiddenRecordChallengeState } from "@/domains/library/content/forbiddenRecords/resolveForbiddenRecordChallengeState.js"
import {
  FORBIDDEN_ASSETS,
  getForbiddenRecordsChallengeClearIllust,
} from "@/domains/library/constants/forbiddenRecords/assets.js"
import {
  BLOOD_SPREAD_ANIMATE,
  BLOOD_SPREAD_INIT,
  BLOOD_SPREAD_ORIGIN,
  BLOOD_SPREAD_TRANSITION,
  UNLOCK_REVEAL_ANIMATE,
  UNLOCK_REVEAL_INIT,
  UNLOCK_REVEAL_TRANSITION,
} from "@/domains/library/constants/forbiddenRecords/entranceMotion.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import UnlockCondition from "@m/domains/library/components/forbidden/UnlockCondition.jsx"
import { BODY_TEXT_CLASS } from "@m/domains/library/constants/libraryStyle.js"

const MotionAsset = motion.create(PublicAsset)

// 가운데서 번지는 그림 (핏자국·클리어 일러스트)
function SpreadArt({ src }) {
  return (
    <MotionAsset
      key={src}
      src={src}
      alt=""
      className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
      initial={BLOOD_SPREAD_INIT}
      animate={BLOOD_SPREAD_ANIMATE}
      transition={BLOOD_SPREAD_TRANSITION}
      style={{ transformOrigin: BLOOD_SPREAD_ORIGIN }}
    />
  )
}

// 알림 대상 기록이면 data 표시 (데스크톱과 같은 이름표), 업적 받기 상태는 위에서 받음
export default function LockPage({ pageIndex, record, achievementsState, targetAchievementId }) {
  const { id, right } = record
  const { locked, unlockCondition, unlockProgress, unlockRewards, progressUnit, clearIllust, body } = right
  const achievement = achievementsState.achievements?.find((entry) => entry.id === id)
  const { challengeCleared, displayedProgress } = resolveForbiddenRecordChallengeState({
    achievement,
    status: achievementsState.status,
    error: achievementsState.error,
    unlockProgress,
    progressUnit,
  })
  const markers = {
    "data-record-id": id,
    "data-notification-target": targetAchievementId !== null && targetAchievementId === id ? "true" : undefined,
  }

  if (!locked) {
    return (
      <div className="flex min-h-full items-center" {...markers}>
        <p className={`m-0 px-2 text-center ${BODY_TEXT_CLASS}`}>{body ?? "해금된 기록 본문이 이 영역에 표시됩니다."}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-full items-center justify-center" {...markers}>
      <div className="relative aspect-[4/5] w-full max-w-[26rem] land:aspect-auto land:h-[min(15rem,62svh)]">
        {challengeCleared ? (
          <SpreadArt src={clearIllust ?? getForbiddenRecordsChallengeClearIllust(pageIndex + 1)} />
        ) : (
          <>
            <SpreadArt src={FORBIDDEN_ASSETS.bloodStain} />
            <motion.div
              className="absolute inset-0 z-[1] flex items-center justify-center px-[8%]"
              initial={UNLOCK_REVEAL_INIT}
              animate={UNLOCK_REVEAL_ANIMATE}
              transition={UNLOCK_REVEAL_TRANSITION}
            >
              <UnlockCondition condition={unlockCondition} progress={displayedProgress} rewards={unlockRewards} />
            </motion.div>
          </>
        )}
      </div>
    </div>
  )
}
