// 금지된 기록 탭 (앞면 원고 + 뒷면 해금 쪽)
// pages/LibraryPage.jsx가 금지된 기록 탭에서 씀
import { useAchievements } from "@/domains/library/hooks/useAchievements.js"
import { getForbiddenRecordsPage } from "@/domains/library/content/forbiddenRecords/pages.js"
import SpreadPages from "@m/domains/library/components/book/SpreadPages.jsx"
import LockPage from "@m/domains/library/components/forbidden/LockPage.jsx"
import StoryPage from "@m/domains/library/components/forbidden/StoryPage.jsx"

// 업적 받기는 탭 단위로 한 번 (면을 넘길 때마다 다시 안 받게 여기서 부름)
export default function ForbiddenRecordsView({ pageIndex, side, twoColumn, targetAchievementId }) {
  const { achievements, status, error } = useAchievements()
  const record = getForbiddenRecordsPage(pageIndex)

  return (
    <SpreadPages
      pageKey={`record-${pageIndex}`}
      side={side}
      twoColumn={twoColumn}
      stickyRight
      left={<StoryPage title={record.left.title} body={record.left.body} />}
      right={
        <LockPage
          pageIndex={pageIndex}
          record={record}
          achievementsState={{ achievements, status, error }}
          targetAchievementId={targetAchievementId}
        />
      }
    />
  )
}
