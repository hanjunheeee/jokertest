import ForbiddenRecordsLeftPage from "../../../../domains/library/components/forbiddenRecords/ForbiddenRecordsLeftPage.jsx"
import ForbiddenRecordsRightPage from "../../../../domains/library/components/forbiddenRecords/ForbiddenRecordsRightPage.jsx"

export default function ForbiddenRecordsSpread({ pageIndex = 0, targetAchievementId = null }) {
  return (
    <>
      <ForbiddenRecordsLeftPage pageIndex={pageIndex} />
      <ForbiddenRecordsRightPage pageIndex={pageIndex} targetAchievementId={targetAchievementId} />
    </>
  )
}