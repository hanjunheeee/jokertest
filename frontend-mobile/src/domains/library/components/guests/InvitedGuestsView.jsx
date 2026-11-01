// 초대받은 자들 탭 (앞면 직업 소개·전적, 뒷면 숙련도 랭킹·도전과제)
// pages/LibraryPage.jsx가 초대받은 자들 탭에서 씀, 직업 탭은 양피지 머리 칸에 따로
import SpreadPages from "@m/domains/library/components/book/SpreadPages.jsx"
import ChallengeList from "@m/domains/library/components/guests/ChallengeList.jsx"
import JobIntroPage from "@m/domains/library/components/guests/JobIntroPage.jsx"
import RankingSection from "@m/domains/library/components/guests/RankingSection.jsx"
import { useInvitedGuestsJob } from "@m/domains/library/hooks/useInvitedGuestsJob.js"
import { STATE_MSG_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 직업 자료가 비면(카탈로그 빠짐) 안내만, 직업 바뀌면 key로 다시 등장
export default function InvitedGuestsView({ jobIndex, side, twoColumn, targetAchievementId }) {
  const { page, retry } = useInvitedGuestsJob(jobIndex, targetAchievementId)

  if (!page.ready) {
    return <p className={`m-0 ${STATE_MSG_CLASS}`}>직업 정보를 준비 중입니다.</p>
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
          <ChallengeList challenges={page.right.challenges} targetAchievementId={targetAchievementId} />
        </div>
      }
    />
  )
}
