// 줄 안 작은 "신고" 버튼 (모바일, 누르는 자리 44px), 신고한 대상이면 "신고됨"으로 잠김
// 전적 시트 줄·결과 목록 줄이 씀, 그림은 추방 줄 버튼과 같음
import { REPORT_BUTTON_ASSETS } from "@/domains/report/constants/reportAssets.js"
import { REPORT_COPY } from "@/domains/report/constants/reportCopy.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { ROW_BUTTON_LOOK } from "@m/domains/game/matching/constants/voteFrameStyle.js"

export default function ReportRowButton({ name, done = false, onClick }) {
  const label = done ? REPORT_COPY.rowDoneLabel : REPORT_COPY.rowButtonLabel
  return (
    <ImageButton
      look={ROW_BUTTON_LOOK}
      src={REPORT_BUTTON_ASSETS.report}
      label={label}
      ariaLabel={`${name} ${label}`}
      disabled={done}
      onClick={(event) => { event?.stopPropagation?.(); onClick?.() }}
      data-testid="report-row-button"
    />
  )
}
