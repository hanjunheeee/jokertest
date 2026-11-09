// 문의 하나 보기 (데스크톱): 종류·상태·날짜·제목·내용 + 운영팀 답들, 불러오는 중·못 찾음 안내, 목록으로
// InquiryWindow가 씀
import { MESSAGE_CLASS, MESSAGE_ERROR_CLASS, REASON_BTN_CLASS, REASON_OFF_CLASS } from "@/domains/report/constants/reportLayout.js"
import { formatInquiryDate, INQUIRY_COPY, inquiryCategoryLabel, inquiryStatusLabel } from "../api/inquiry.api.js"

const FOCUS_RING_CLASS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"

const SMALL_CLASS = "font-subheading app-text-scaled [--app-text-size:clamp(0.66rem,2cqi,0.78rem)] leading-tight text-white/65"
const BODY_CLASS =
  "whitespace-pre-wrap break-words font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,2.25cqi,0.88rem)] leading-snug text-white"
const BOX_CLASS = "rounded-sm border border-[#3a2818]/75 bg-[#120a06]/55 p-2"

// 운영팀 답 하나 (관리자 아이디 대신 "운영팀")
function ReplyBox({ reply }) {
  return (
    <li className={`${BOX_CLASS} border-[#f3d28d]/50`}>
      <p className={`${SMALL_CLASS} mb-1 font-bold text-[#f5e8c8]`}>
        {reply.from || INQUIRY_COPY.replyFrom} · {formatInquiryDate(reply.createdAt)}
      </p>
      <p className={BODY_CLASS}>{reply.body}</p>
    </li>
  )
}

export default function InquiryDetail({ detail, onBack }) {
  const inquiry = detail?.inquiry
  const replies = Array.isArray(inquiry?.replies) ? inquiry.replies : []

  return (
    <div className="flex flex-col gap-2" data-testid="inquiry-detail">
      <button type="button" onClick={onBack} className={`${REASON_BTN_CLASS} ${REASON_OFF_CLASS} self-start px-3 ${FOCUS_RING_CLASS}`}>
        {INQUIRY_COPY.back}
      </button>
      {detail?.status === "loading" ? <p role="status" className={SMALL_CLASS}>{INQUIRY_COPY.loading}</p> : null}
      {detail?.status === "error" ? (
        <p role="alert" data-testid="inquiry-detail-error" className={`${MESSAGE_CLASS} ${MESSAGE_ERROR_CLASS}`}>{detail.message}</p>
      ) : null}
      {inquiry ? (
        <>
          <p className={SMALL_CLASS}>
            {inquiryCategoryLabel(inquiry.category)} · {inquiryStatusLabel(inquiry.status)} · {formatInquiryDate(inquiry.createdAt)}
          </p>
          <h3 className={`${BODY_CLASS} font-bold text-[#f5e8c8]`}>{inquiry.title}</h3>
          <p className={`${BOX_CLASS} ${BODY_CLASS}`}>{inquiry.body}</p>
          {replies.length > 0 ? (
            <ul className="flex flex-col gap-1.5" aria-label="운영팀 답">
              {replies.map((reply) => <ReplyBox key={reply.id} reply={reply} />)}
            </ul>
          ) : (
            <p className={SMALL_CLASS}>{INQUIRY_COPY.noReply}</p>
          )}
        </>
      ) : null}
    </div>
  )
}
