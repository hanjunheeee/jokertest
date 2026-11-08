// 초대받은 자들 탭 (폰: 직업 소개·전적·도전과제 한 스크롤 / 넓은 화면: 양쪽 펼침)
// pages/LibraryPage.jsx가 초대받은 자들 탭에서 씀, 직업 탭은 양피지 머리 칸에 따로
import { motion } from "framer-motion"
import SpreadPages from "@m/domains/library/components/book/SpreadPages.jsx"
import ChallengeList from "@m/domains/library/components/guests/ChallengeList.jsx"
import JobIntroPage from "@m/domains/library/components/guests/JobIntroPage.jsx"
import RankingSection from "@m/domains/library/components/guests/RankingSection.jsx"
import { useInvitedGuestsJob } from "@m/domains/library/hooks/useInvitedGuestsJob.js"
import { INVITED_TABLE_PANEL_CLASS } from "@m/domains/library/constants/guestsStyle.js"
import { SECTION_TITLE_CLASS } from "@m/domains/library/constants/libraryStyle.js"
import { revealProps } from "@m/domains/library/constants/guestsMotion.js"

// 직업 자료가 비면(카탈로그 빠짐) 데스크톱처럼 빈 쪽, 직업 바뀌면 key로 다시 등장
export default function InvitedGuestsView({ jobIndex, side, twoColumn, targetAchievementId }) {
  const { page, retry } = useInvitedGuestsJob(jobIndex, targetAchievementId)

  if (!page.ready) return null

  if (!twoColumn) {
    return (
      <div key={`job-${jobIndex}-merged`} className="flex flex-col gap-6 pb-2">
        <JobIntroPage content={page.left} onRetry={retry} />
        <motion.section className={`flex flex-col gap-1.5 ${INVITED_TABLE_PANEL_CLASS}`} {...revealProps("rightLower")}>
          <h3 className={`m-0 ${SECTION_TITLE_CLASS}`}>도전과제</h3>
          <ChallengeList challenges={page.right.challenges} targetAchievementId={targetAchievementId} />
        </motion.section>
      </div>
    )
  }

  return (
    <SpreadPages
      pageKey={`job-${jobIndex}`}
      side={side}
      twoColumn={twoColumn}
      left={<JobIntroPage content={page.left} onRetry={retry} />}
      right={
        <div className="flex flex-col gap-5">
          <RankingSection key={jobIndex} content={page.right} onRetry={retry} />
          <motion.div {...revealProps("rightLower")}>
            <ChallengeList challenges={page.right.challenges} targetAchievementId={targetAchievementId} />
          </motion.div>
        </div>
      }
    />
  )
}
