// 내 문의 목록 (데스크톱): 보낸 안내·불러오는 중·오류(다시 불러오기)·빈 목록·줄(종류·제목·상태·날짜)
// InquiryWindow가 씀, 줄을 누르면 그 문의를 엶
import { MESSAGE_CLASS, MESSAGE_ERROR_CLASS, MESSAGE_OK_CLASS, REASON_BTN_CLASS, REASON_OFF_CLASS } from "@/domains/report/constants/reportLayout.js"
import { formatInquiryDate, INQUIRY_COPY, inquiryCategoryLabel, inquiryStatusLabel } from "../api/inquiry.api.js"

const FOCUS_RING_CLASS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"

const NOTE_CLASS =
  "py-3 text-center font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,2.2cqi,0.85rem)] leading-snug text-white/80"

const ROW_CLASS =
  "flex w-full cursor-pointer items-center gap-2 rounded-sm border border-[#3a2818]/75 bg-[#120a06]/55 px-2 py-2 text-left hover:border-[#f3d28d]/60"

const TEXT_CLASS = "font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,2.2cqi,0.85rem)] leading-tight"

// 상태 글자는 색만 아니라 글자로도 (답함은 밝은 테두리)
const statusClass = (status) =>
  status === "ANSWERED"
    ? "border-[#f3d28d] text-[#f5e8c8]"
    : "border-white/30 text-white/75"

function InquiryRow({ item, onOpen }) {
  return (
    <li>
      <button type="button" className={`${ROW_CLASS} ${FOCUS_RING_CLASS}`} onClick={() => onOpen(item.id)} data-testid={`inquiry-row-${item.id}`}>
        <span className={`${TEXT_CLASS} shrink-0 text-white/60`}>{inquiryCategoryLabel(item.category)}</span>
        <span className={`${TEXT_CLASS} min-w-0 flex-1 truncate font-bold text-white`}>{item.title}</span>
        <span className={`${TEXT_CLASS} shrink-0 tabular-nums text-white/55`}>{formatInquiryDate(item.createdAt)}</span>
        <span className={`${TEXT_CLASS} shrink-0 rounded-sm border px-1.5 py-0.5 font-bold ${statusClass(item.status)}`}>
          {inquiryStatusLabel(item.status)}
        </span>
      </button>
    </li>
  )
}

export default function InquiryList({ list, notice, onOpen, onReload }) {
  const { status, items } = list

  return (
    <div className="flex flex-col" data-testid="inquiry-list">
      {notice ? (
        <p role="status" data-testid="inquiry-notice" className={`${MESSAGE_CLASS} ${MESSAGE_OK_CLASS}`}>{notice}</p>
      ) : null}
      {status === "loading" && items.length === 0 ? <p className={NOTE_CLASS} role="status">{INQUIRY_COPY.loading}</p> : null}
      {status === "error" ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <p role="alert" className={`${MESSAGE_CLASS} ${MESSAGE_ERROR_CLASS}`}>{INQUIRY_COPY.listError}</p>
          <button type="button" onClick={onReload} className={`${REASON_BTN_CLASS} ${REASON_OFF_CLASS} px-3 ${FOCUS_RING_CLASS}`}>
            {INQUIRY_COPY.retry}
          </button>
        </div>
      ) : null}
      {status === "ready" && items.length === 0 ? <p className={NOTE_CLASS}>{INQUIRY_COPY.empty}</p> : null}
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => <InquiryRow key={item.id} item={item} onOpen={onOpen} />)}
        </ul>
      ) : null}
    </div>
  )
}
