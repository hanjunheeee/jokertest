// 줄 안 작은 "신고" 버튼 (신고한 대상이면 "신고됨"으로 잠김)
// 데스크톱 전적 목록 줄·결과 참가자 줄이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { REPORT_BUTTON_ASSETS } from "../constants/reportAssets.js"
import { REPORT_COPY } from "../constants/reportCopy.js"
import { ROW_BTN_CLASS, ROW_BTN_IMG_CLASS, ROW_BTN_LABEL_CLASS } from "../constants/reportLayout.js"

const FOCUS_RING_CLASS = "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"

export default function ReportRowButton({ name, done = false, onClick }) {
  const label = done ? REPORT_COPY.rowDoneLabel : REPORT_COPY.rowButtonLabel
  return (
    <button
      type="button"
      aria-label={done ? `${name} ${REPORT_COPY.rowDoneLabel}` : `${name} ${REPORT_COPY.rowButtonLabel}`}
      disabled={done}
      onClick={(event) => { event.stopPropagation(); onClick?.() }}
      className={`${ROW_BTN_CLASS} ${FOCUS_RING_CLASS}`}
      data-testid="report-row-button"
    >
      <PublicAsset src={REPORT_BUTTON_ASSETS.report} alt="" className={ROW_BTN_IMG_CLASS} />
      <span className={ROW_BTN_LABEL_CLASS}>{label}</span>
    </button>
  )
}
