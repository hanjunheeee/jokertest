import ForbiddenRecordsLeftPage from "@/domains/library/components/forbiddenRecords/ForbiddenRecordsLeftPage.jsx"
import ForbiddenRecordsRightPage from "@/domains/library/components/forbiddenRecords/ForbiddenRecordsRightPage.jsx"

/** 금지된 기록 — 좌·우 페이지 스프레드 */
export default function ForbiddenRecordsSpread({ pageIndex = 0 }) {
  return (
    <>
      <ForbiddenRecordsLeftPage pageIndex={pageIndex} />
      <ForbiddenRecordsRightPage pageIndex={pageIndex} />
    </>
  )
}
