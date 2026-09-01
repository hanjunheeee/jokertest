import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import InvitedGuestsJobTabs from "@/domains/library/components/invitedGuests/left/InvitedGuestsJobTabs.jsx"
import InvitedGuestsJobIntro from "@/domains/library/components/invitedGuests/left/InvitedGuestsJobIntro.jsx"
import InvitedGuestsMyJobStats from "@/domains/library/components/invitedGuests/left/InvitedGuestsMyJobStats.jsx"
import InvitedGuestsJobChallenges from "@/domains/library/components/invitedGuests/right/InvitedGuestsJobChallenges.jsx"
import InvitedGuestsMasteryRanking from "@/domains/library/components/invitedGuests/right/InvitedGuestsMasteryRanking.jsx"
import InvitedGuestsSectionTitle from "@/domains/library/components/invitedGuests/shared/InvitedGuestsSectionTitle.jsx"
import { getInvitedGuestsPage } from "@/domains/library/content/invitedGuests/index.js"
import { INVITED_GUESTS_JOB_SPREAD_META } from "@/domains/library/content/invitedGuests/jobSpreadMeta.js"
import {
  INVITED_GUESTS_JOB_TITLE_CLASS,
  INVITED_GUESTS_JOB_TABS_ANCHOR_CLASS,
  INVITED_GUESTS_SPREAD_GRID_CLASS,
  INVITED_GUESTS_SPREAD_LEFT_LOWER_CELL_CLASS,
  INVITED_GUESTS_SPREAD_LEFT_UPPER_CELL_CLASS,
  INVITED_GUESTS_SPREAD_RIGHT_COLUMN_CLASS,
  INVITED_GUESTS_SPREAD_RIGHT_LOWER_CELL_CLASS,
  INVITED_GUESTS_SPREAD_RIGHT_UPPER_CELL_CLASS,
  INVITED_GUESTS_SPREAD_UPPER_SECTION_CLASS,
  INVITED_GUESTS_TABLE_SECTION_CLASS,
} from "@/domains/library/constants/invitedGuests/layoutStyle.js"
import {
  INVITED_GUESTS_REVEAL_ANIMATE,
  INVITED_GUESTS_REVEAL_DELAYS,
  INVITED_GUESTS_REVEAL_INITIAL,
  invitedGuestsRevealTransition,
} from "@/domains/library/constants/invitedGuests/entranceMotion.js"

/** 초대받은 자들 — 좌·우 페이지 스프레드 (하단 행 Y 정렬) */
export default function InvitedGuestsSpread() {
  const [jobIndex, setJobIndex] = useState(0)
  const rightColumnRef = useRef(null)
  const page = getInvitedGuestsPage(jobIndex)
  const isReady = page.ready

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
    <div className={INVITED_GUESTS_SPREAD_GRID_CLASS}>
      <div className={INVITED_GUESTS_SPREAD_LEFT_UPPER_CELL_CLASS}>
        {leftContent && (
          <motion.div
            key={`invited-left-upper-${jobIndex}`}
            className={INVITED_GUESTS_SPREAD_UPPER_SECTION_CLASS}
            initial={INVITED_GUESTS_REVEAL_INITIAL}
            animate={INVITED_GUESTS_REVEAL_ANIMATE}
            transition={invitedGuestsRevealTransition(INVITED_GUESTS_REVEAL_DELAYS.leftUpper)}
          >
            <h2 className={INVITED_GUESTS_JOB_TITLE_CLASS}>직업 [{leftContent.jobName}]</h2>
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
        <motion.div
          key={`invited-left-lower-${jobIndex}`}
          className={INVITED_GUESTS_SPREAD_LEFT_LOWER_CELL_CLASS}
          initial={INVITED_GUESTS_REVEAL_INITIAL}
          animate={INVITED_GUESTS_REVEAL_ANIMATE}
          transition={invitedGuestsRevealTransition(INVITED_GUESTS_REVEAL_DELAYS.leftLower)}
        >
          <InvitedGuestsMyJobStats {...leftContent.myStats} />
        </motion.div>
      )}

      <div ref={rightColumnRef} className={INVITED_GUESTS_SPREAD_RIGHT_COLUMN_CLASS}>
        <div className={INVITED_GUESTS_SPREAD_RIGHT_UPPER_CELL_CLASS}>
          <section className={INVITED_GUESTS_TABLE_SECTION_CLASS}>
            <motion.div
              key={`invited-right-tabs-${jobIndex}`}
              className={INVITED_GUESTS_JOB_TABS_ANCHOR_CLASS}
              initial={INVITED_GUESTS_REVEAL_INITIAL}
              animate={INVITED_GUESTS_REVEAL_ANIMATE}
              transition={invitedGuestsRevealTransition(INVITED_GUESTS_REVEAL_DELAYS.rightTabs)}
            >
              {jobTabs}
            </motion.div>
            {rightContent && (
              <>
                <motion.div
                  key={`invited-right-title-${jobIndex}`}
                  initial={INVITED_GUESTS_REVEAL_INITIAL}
                  animate={INVITED_GUESTS_REVEAL_ANIMATE}
                  transition={invitedGuestsRevealTransition(INVITED_GUESTS_REVEAL_DELAYS.rightTitle)}
                >
                  <InvitedGuestsSectionTitle>직업별 숙련도 랭킹</InvitedGuestsSectionTitle>
                </motion.div>
                <motion.div
                  key={`invited-right-upper-${jobIndex}`}
                  initial={INVITED_GUESTS_REVEAL_INITIAL}
                  animate={INVITED_GUESTS_REVEAL_ANIMATE}
                  transition={invitedGuestsRevealTransition(INVITED_GUESTS_REVEAL_DELAYS.rightUpper)}
                >
                  <InvitedGuestsMasteryRanking ranking={rightContent.ranking} hideHeader />
                </motion.div>
              </>
            )}
          </section>
        </div>
        {rightContent && (
          <motion.div
            key={`invited-right-lower-${jobIndex}`}
            className={INVITED_GUESTS_SPREAD_RIGHT_LOWER_CELL_CLASS}
            initial={INVITED_GUESTS_REVEAL_INITIAL}
            animate={INVITED_GUESTS_REVEAL_ANIMATE}
            transition={invitedGuestsRevealTransition(INVITED_GUESTS_REVEAL_DELAYS.rightLower)}
          >
            <InvitedGuestsJobChallenges challenges={rightContent.challenges} />
          </motion.div>
        )}
      </div>
    </div>
  )
}
