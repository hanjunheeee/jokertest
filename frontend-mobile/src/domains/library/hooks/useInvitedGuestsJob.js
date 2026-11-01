// 초대받은 자들 고른 직업 자료 (소개·전적·랭킹·도전과제)와 받기·다시 받기
// guests/InvitedGuestsView.jsx가 씀, 데스크톱 InvitedGuestsSpread 안 로직을 모바일 쪽에 옮겨 둠
import { useEffect } from "react"
import { getInvitedGuestsPage } from "@/domains/library/content/invitedGuests/pages.js"
import { useRoleStatisticsStore } from "@/domains/library/store/roleStatistics.store.js"

// 직업 순번으로 펼침면 자료를 만들고, 아직 안 받은 직업이면 받음
export function useInvitedGuestsJob(jobIndex, targetAchievementId) {
  const byJobKey = useRoleStatisticsStore((state) => state.byJobKey)
  const requestJob = useRoleStatisticsStore((state) => state.requestJob)
  const retryJob = useRoleStatisticsStore((state) => state.retryJob)

  const page = getInvitedGuestsPage(jobIndex, { byJobKey })
  const jobKey = page.jobKey

  // 고른 직업 통계를 아직 안 받았으면 받음
  useEffect(() => {
    if (!jobKey) return
    if (byJobKey[jobKey]?.status === "idle") requestJob(jobKey)
  }, [jobKey, byJobKey, requestJob])

  // 업적 알림에서 들어오면 진행도를 새로 받으려고 다시 요청 (데스크톱과 같음)
  useEffect(() => {
    if (!targetAchievementId || !jobKey) return
    retryJob(jobKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAchievementId, jobKey])

  // 실패 칸의 다시 시도 버튼
  const retry = () => retryJob(jobKey)

  return { page, retry }
}
