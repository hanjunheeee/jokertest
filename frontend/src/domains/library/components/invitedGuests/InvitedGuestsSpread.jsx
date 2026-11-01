// 초대받은 손님 펼침면 (직업 탭·직업 소개·내 전적·숙련도 랭킹·도전과제, 직업별 통계는 roleStatistics 스토어)
// 도서관 화면이 초대받은 손님 탭에서 씀
import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import InvitedGuestsJobTabs from "../../../../domains/library/components/invitedGuests/left/InvitedGuestsJobTabs.jsx"
import InvitedGuestsJobIntro from "../../../../domains/library/components/invitedGuests/left/InvitedGuestsJobIntro.jsx"
import InvitedGuestsStatsCell from "../../../../domains/library/components/invitedGuests/left/InvitedGuestsStatsCell.jsx"
import InvitedGuestsJobChallenges from "../../../../domains/library/components/invitedGuests/right/InvitedGuestsJobChallenges.jsx"
import InvitedGuestsRankingCell from "../../../../domains/library/components/invitedGuests/right/InvitedGuestsRankingCell.jsx"
import { getInvitedGuestsPage } from "../../content/invitedGuests/pages.js"
import { INVITED_GUESTS_JOB_SPREAD_META } from "../../../../shared/constants/jobSpreadMeta.js"
import { useRoleStatisticsStore } from "../../../../domains/library/store/roleStatistics.store.js"
import {
  JOB_TITLE_CLASS,
  JOB_TABS_ANCHOR_CLASS,
  SPREAD_GRID_CLASS,
  SPREAD_LEFT_UPPER_CELL_CLASS,
  SPREAD_RIGHT_COLUMN_CLASS,
  SPREAD_RIGHT_LOWER_CELL_CLASS,
  SPREAD_RIGHT_UPPER_CELL_CLASS,
  SPREAD_UPPER_SECTION_CLASS,
  TABLE_SECTION_CLASS,
} from "../../../../domains/library/constants/invitedGuests/layoutStyle.js"
import {
  REVEAL_ANIMATE,
  REVEAL_DELAYS,
  REVEAL_INIT,
  revealTransition,
} from "../../../../domains/library/constants/invitedGuests/entranceMotion.js"

// 직업을 고를 때마다 칸마다 key를 바꿔 등장 움직임을 다시 보임
export default function InvitedGuestsSpread({
  jobIndex: controlledJobIndex,
  onJobChange,
  targetAchievementId = null,
}) {
  const [uncontrolledJobIndex, setUncontrolledJobIndex] = useState(0)
  const jobIndex = controlledJobIndex ?? uncontrolledJobIndex
  const setJobIndex = onJobChange ?? setUncontrolledJobIndex
  const rightColumnRef = useRef(null)

  const byJobKey = useRoleStatisticsStore((state) => state.byJobKey)
  const requestJob = useRoleStatisticsStore((state) => state.requestJob)
  const retryJob = useRoleStatisticsStore((state) => state.retryJob)

  const page = getInvitedGuestsPage(jobIndex, { byJobKey })
  const isReady = page.ready
  const jobKey = page.jobKey

  // 고른 직업 통계를 아직 안 받았으면 받음
  useEffect(() => {
    if (!jobKey) return undefined
    if (byJobKey[jobKey]?.status === "idle") requestJob(jobKey)
    return undefined
  }, [jobKey, byJobKey, requestJob])

  // 업적 알림에서 들어오면 진행도를 새로 받으려고 다시 요청함
  useEffect(() => {
    if (!targetAchievementId || !jobKey) return undefined
    retryJob(jobKey)
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAchievementId, jobKey])

  // 오른쪽 칸은 휠로 펼침면이 넘어가지 않게 막음
  useEffect(() => {
    if (!isReady) return undefined

    const column = rightColumnRef.current
    if (!column) return undefined

    const blockWheelScroll = (event) => {
      event.preventDefault()
    }

    column.addEventListener("wheel", blockWheelScroll, { passive: false })
    return () => column.removeEventListener("wheel", blockWheelScroll)
  }, [isReady, jobIndex])

  const leftContent = isReady ? page.left : null
  const rightContent = isReady ? page.right : null
  const jobTabs = (
    <InvitedGuestsJobTabs
      tabs={INVITED_GUESTS_JOB_SPREAD_META}
      activeIndex={jobIndex}
      onSelect={setJobIndex}
    />
  )

  return (
    <div className={SPREAD_GRID_CLASS}>
      <div className={SPREAD_LEFT_UPPER_CELL_CLASS}>
        {leftContent && (
          <motion.div
            key={`invited-left-upper-${jobIndex}`}
            className={SPREAD_UPPER_SECTION_CLASS}
            initial={REVEAL_INIT}
            animate={REVEAL_ANIMATE}
            transition={revealTransition(REVEAL_DELAYS.leftUpper)}
          >
            <h2 className={JOB_TITLE_CLASS}>직업 [{leftContent.jobName}]</h2>
            <InvitedGuestsJobIntro
              description={leftContent.description}
              standingImage={leftContent.standingImage}
              standingImageClass={leftContent.standingImageClass}
              standingImageWrapClass={leftContent.standingImageWrapClass}
            />
          </motion.div>
        )}
      </div>

      {leftContent && (
        <InvitedGuestsStatsCell key={`invited-left-lower-${jobIndex}`} content={leftContent} onRetry={() => retryJob(jobKey)} />
      )}

      <div ref={rightColumnRef} className={SPREAD_RIGHT_COLUMN_CLASS}>
        <div className={SPREAD_RIGHT_UPPER_CELL_CLASS}>
          <section className={TABLE_SECTION_CLASS}>
            <motion.div
              key={`invited-right-tabs-${jobIndex}`}
              className={JOB_TABS_ANCHOR_CLASS}
              initial={REVEAL_INIT}
              animate={REVEAL_ANIMATE}
              transition={revealTransition(REVEAL_DELAYS.rightTabs)}
            >
              {jobTabs}
            </motion.div>
            {rightContent && (
              <InvitedGuestsRankingCell jobIndex={jobIndex} content={rightContent} onRetry={() => retryJob(jobKey)} />
            )}
          </section>
        </div>
        {rightContent && (
          <motion.div
            key={`invited-right-lower-${jobIndex}`}
            className={SPREAD_RIGHT_LOWER_CELL_CLASS}
            initial={REVEAL_INIT}
            animate={REVEAL_ANIMATE}
            transition={revealTransition(REVEAL_DELAYS.rightLower)}
          >
            <InvitedGuestsJobChallenges
              challenges={rightContent.challenges}
              targetAchievementId={targetAchievementId}
            />
          </motion.div>
        )}
      </div>
    </div>
  )
}