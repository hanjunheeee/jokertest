// 금지된 기록 펼침면 (왼쪽 원고 + 오른쪽 해금 쪽)
// book/LibraryBookContent.jsx가 씀
import ForbiddenRecordsLeftPage from "../../../../domains/library/components/forbiddenRecords/ForbiddenRecordsLeftPage.jsx"
import ForbiddenRecordsRightPage from "../../../../domains/library/components/forbiddenRecords/ForbiddenRecordsRightPage.jsx"

// 같은 쪽 번호로 양쪽 그림, 알림 대상 업적 id는 오른쪽만 받음
export default function ForbiddenRecordsSpread({ pageIndex = 0, targetAchievementId = null }) {
  return (
    <>
      <ForbiddenRecordsLeftPage pageIndex={pageIndex} />
      <ForbiddenRecordsRightPage pageIndex={pageIndex} targetAchievementId={targetAchievementId} />
    </>
  )
}