// 내 문의 목록·문의 하나 보기 (모바일): 목록은 보낸 안내·불러오는 중·오류·빈 목록·줄, 하나 보기는 내용 + 운영팀 답
// InquirySheet가 씀, 글·상태 글자는 데스크톱과 같음
import {
  formatInquiryDate, INQUIRY_COPY, inquiryCategoryLabel, inquiryStatusLabel,
} from "@/domains/inquiry/api/inquiry.api.js"
import { ERROR_CLASS, NOTE_CLASS } from "@m/domains/game/matching/constants/voteFrameStyle.js"

const SMALL_BTN_CLASS =
  "min-h-11 cursor-pointer rounded-sm border border-[#3a2818]/75 bg-[#120a06]/55 px-3 font-subheading app-text-scaled [--app-text-size:0.88rem] font-bold text-white"
const ROW_CLASS =
  "flex min-h-[3.25rem] w-full cursor-pointer flex-col gap-1 rounded-sm border border-[#3a2818]/75 bg-[#120a06]/55 px-2.5 py-2 text-left active:border-[#f3d28d]/70"
const TEXT_CLASS = "font-subheading app-text-scaled [--app-text-size:0.88rem] leading-tight"
const SUB_CLASS = "font-subheading app-text-scaled [--app-text-size:0.78rem] leading-tight text-white/65"
const BODY_CLASS = "whitespace-pre-wrap break-words font-subheading app-text-scaled [--app-text-size:0.92rem] leading-snug text-white"
const BOX_CLASS = "rounded-sm border border-[#3a2818]/75 bg-[#120a06]/55 p-2.5"

// 상태 글자는 색만 아니라 글자로도
const statusClass = (status) => (status === "ANSWERED" ? "border-[#f3d28d] text-[#f5e8c8]" : "border-white/30 text-white/75")

function Row({ item, onOpen }) {
  return (
    <li>
      <button type="button" className={ROW_CLASS} onClick={() => onOpen(item.id)} data-testid={`inquiry-row-${item.id}`}>
        <span className="flex w-full items-center gap-2">
          <span className={`${TEXT_CLASS} min-w-0 flex-1 truncate font-bold text-white`}>{item.title}</span>
          <span className={`${TEXT_CLASS} shrink-0 rounded-sm border px-1.5 py-0.5 font-bold ${statusClass(item.status)}`}>
            {inquiryStatusLabel(item.status)}
          </span>
        </span>
        <span className={SUB_CLASS}>{inquiryCategoryLabel(item.category)} · {formatInquiryDate(item.createdAt)}</span>
      </button>
    </li>
  )
}

export default function InquiryList({ list, notice, onOpen, onReload }) {
  const { status, items } = list
  return (
    <div className="flex flex-col gap-2" data-testid="inquiry-list">
      {notice ? <p role="status" data-testid="inquiry-notice" className={`${NOTE_CLASS} text-center text-[#e8f0dc]`}>{notice}</p> : null}
      {status === "loading" && items.length === 0 ? <p role="status" className={`${NOTE_CLASS} py-3 text-center text-white/80`}>{INQUIRY_COPY.loading}</p> : null}
      {status === "error" ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <p role="alert" className={`text-center ${ERROR_CLASS}`}>{INQUIRY_COPY.listError}</p>
          <button type="button" onClick={onReload} className={SMALL_BTN_CLASS}>{INQUIRY_COPY.retry}</button>
        </div>
      ) : null}
      {status === "ready" && items.length === 0 ? <p className={`${NOTE_CLASS} py-3 text-center text-white/80`}>{INQUIRY_COPY.empty}</p> : null}
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
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
    <div className="flex flex-col gap-2" data-testid="inquiry-detail">
      <button type="button" onClick={onBack} className={`${SMALL_BTN_CLASS} self-start`}>{INQUIRY_COPY.back}</button>
      {detail?.status === "loading" ? <p role="status" className={SUB_CLASS}>{INQUIRY_COPY.loading}</p> : null}
      {detail?.status === "error" ? (
        <p role="alert" data-testid="inquiry-detail-error" className={`text-center ${ERROR_CLASS}`}>{detail.message}</p>
      ) : null}
      {inquiry ? (
        <>
          <p className={SUB_CLASS}>
            {inquiryCategoryLabel(inquiry.category)} · {inquiryStatusLabel(inquiry.status)} · {formatInquiryDate(inquiry.createdAt)}
          </p>
          <h3 className={`${BODY_CLASS} font-bold text-[#f5e8c8]`}>{inquiry.title}</h3>
          <p className={`${BOX_CLASS} ${BODY_CLASS}`}>{inquiry.body}</p>
          {replies.length > 0 ? (
            <ul className="flex flex-col gap-1.5" aria-label="운영팀 답">
              {replies.map((reply) => (
                <li key={reply.id} className={`${BOX_CLASS} border-[#f3d28d]/50`}>
                  <p className={`${SUB_CLASS} mb-1 font-bold text-[#f5e8c8]`}>{reply.from || INQUIRY_COPY.replyFrom} · {formatInquiryDate(reply.createdAt)}</p>
                  <p className={BODY_CLASS}>{reply.body}</p>
                </li>
              ))}
            </ul>
          ) : <p className={SUB_CLASS}>{INQUIRY_COPY.noReply}</p>}
        </>
      ) : null}
    </div>
  )
}
