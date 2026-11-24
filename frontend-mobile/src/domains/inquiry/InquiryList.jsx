// 내 문의 목록·문의 하나 보기 (모바일): 목록은 보낸 안내·불러오는 중·오류·빈 목록·줄, 하나 보기는 내용 + 운영팀 답
// InquirySheet가 씀, 글·상태 글자는 데스크톱과 같음
import {
  formatInquiryDate, INQUIRY_COPY, inquiryCategoryLabel, inquiryStatusLabel,
} from "@/domains/inquiry/api/inquiry.api.js"
import { ERROR_CLASS } from "@m/domains/game/matching/constants/voteFrameStyle.js"
import {
  INQUIRY_BACK_BTN_CLASS,
  INQUIRY_BODY_TEXT_CLASS,
  INQUIRY_BOX_CLASS,
  INQUIRY_DETAIL_ROOT_CLASS,
  INQUIRY_DETAIL_SCROLL_CLASS,
  INQUIRY_LIST_GAP,
  INQUIRY_NOTE_CLASS,
  INQUIRY_ROW_CLASS,
  INQUIRY_SMALL_BTN_CLASS,
  INQUIRY_SUB_CLASS,
  INQUIRY_TEXT_CLASS,
} from "@m/domains/inquiry/inquiryMobileStyle.js"

// 상태 글자는 색만 아니라 글자로도
const statusClass = (status) => (status === "ANSWERED" ? "border-[#f3d28d] text-[#f5e8c8]" : "border-white/30 text-white/75")

function Row({ item, onOpen }) {
  return (
    <li>
      <button type="button" className={INQUIRY_ROW_CLASS} onClick={() => onOpen(item.id)} data-testid={`inquiry-row-${item.id}`}>
        <span className="flex w-full items-center gap-1.5">
          <span className={`${INQUIRY_TEXT_CLASS} min-w-0 flex-1 truncate font-bold text-white`}>{item.title}</span>
          <span className={`${INQUIRY_TEXT_CLASS} shrink-0 rounded-sm border px-1 py-0.5 text-[0.72rem] font-bold ${statusClass(item.status)}`}>
            {inquiryStatusLabel(item.status)}
          </span>
        </span>
        <span className={INQUIRY_SUB_CLASS}>{inquiryCategoryLabel(item.category)} · {formatInquiryDate(item.createdAt)}</span>
      </button>
    </li>
  )
}

export default function InquiryList({ list, notice, onOpen, onReload }) {
  const { status, items } = list
  return (
    <div className={`flex flex-col ${INQUIRY_LIST_GAP}`} data-testid="inquiry-list">
      {notice ? <p role="status" data-testid="inquiry-notice" className={`${INQUIRY_NOTE_CLASS} text-center text-[#e8f0dc]`}>{notice}</p> : null}
      {status === "loading" && items.length === 0 ? <p role="status" className={`${INQUIRY_NOTE_CLASS} py-2 text-center text-white/80`}>{INQUIRY_COPY.loading}</p> : null}
      {status === "error" ? (
        <div className="flex flex-col items-center gap-1.5 py-1.5">
          <p role="alert" className={`text-center ${ERROR_CLASS} [--app-text-size:0.8rem]`}>{INQUIRY_COPY.listError}</p>
          <button type="button" onClick={onReload} className={INQUIRY_SMALL_BTN_CLASS}>{INQUIRY_COPY.retry}</button>
        </div>
      ) : null}
      {status === "ready" && items.length === 0 ? <p className={`${INQUIRY_NOTE_CLASS} py-2 text-center text-white/80`}>{INQUIRY_COPY.empty}</p> : null}
      {items.length > 0 ? (
        <ul className={`flex flex-col ${INQUIRY_LIST_GAP}`}>
          {items.map((item) => <Row key={item.id} item={item} onOpen={onOpen} />)}
        </ul>
      ) : null}
    </div>
  )
}

// 문의 하나 (답은 관리자 아이디 대신 "운영팀")
export function InquiryDetailView({ detail, onBack }) {
  const inquiry = detail?.inquiry
  const replies = Array.isArray(inquiry?.replies) ? inquiry.replies : []
  return (
    <div className={INQUIRY_DETAIL_ROOT_CLASS} data-testid="inquiry-detail">
      <div className={INQUIRY_DETAIL_SCROLL_CLASS}>
        {detail?.status === "loading" ? <p role="status" className={INQUIRY_SUB_CLASS}>{INQUIRY_COPY.loading}</p> : null}
        {detail?.status === "error" ? (
          <p role="alert" data-testid="inquiry-detail-error" className={`text-center ${ERROR_CLASS}`}>{detail.message}</p>
        ) : null}
        {inquiry ? (
          <>
            <p className={INQUIRY_SUB_CLASS}>
              {inquiryCategoryLabel(inquiry.category)} · {inquiryStatusLabel(inquiry.status)} · {formatInquiryDate(inquiry.createdAt)}
            </p>
            <h3 className={`${INQUIRY_BODY_TEXT_CLASS} font-bold text-[#f5e8c8]`}>{inquiry.title}</h3>
            <p className={`${INQUIRY_BOX_CLASS} ${INQUIRY_BODY_TEXT_CLASS}`}>{inquiry.body}</p>
            {replies.length > 0 ? (
              <ul className={`flex flex-col ${INQUIRY_LIST_GAP}`} aria-label="운영팀 답">
                {replies.map((reply) => (
                  <li key={reply.id} className={`${INQUIRY_BOX_CLASS} border-[#f3d28d]/50`}>
                    <p className={`${INQUIRY_SUB_CLASS} mb-0.5 font-bold text-[#f5e8c8]`}>{reply.from || INQUIRY_COPY.replyFrom} · {formatInquiryDate(reply.createdAt)}</p>
                    <p className={INQUIRY_BODY_TEXT_CLASS}>{reply.body}</p>
                  </li>
                ))}
              </ul>
            ) : <p className={INQUIRY_SUB_CLASS}>{INQUIRY_COPY.noReply}</p>}
          </>
        ) : null}
      </div>
      <button type="button" onClick={onBack} className={INQUIRY_BACK_BTN_CLASS}>
        {INQUIRY_COPY.back}
      </button>
    </div>
  )
}
