// 문의 쓰기 폼 (데스크톱): 종류 셋·제목·내용·글자 수·안내 글·보내기 버튼
// InquiryWindow가 useInquiries 값을 넘겨 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { REPORT_BUTTON_ASSETS } from "@/domains/report/constants/reportAssets.js"
import {
  ACTION_BTN_CLASS, ACTION_BTN_IMG_CLASS, ACTION_BTN_LABEL_CLASS, MEMO_CLASS, MEMO_COUNT_CLASS, MESSAGE_CLASS,
  MESSAGE_ERROR_CLASS, REASON_BTN_CLASS, REASON_OFF_CLASS, REASON_ON_CLASS,
} from "@/domains/report/constants/reportLayout.js"
import { INQUIRY_BODY_MAX, INQUIRY_CATEGORIES, INQUIRY_COPY, INQUIRY_TITLE_MAX } from "../api/inquiry.api.js"

const FOCUS_RING_CLASS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"

// 칸 이름표 (화면에 보이는 글자)
const LABEL_CLASS =
  "mb-1 block shrink-0 font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,2.2cqi,0.85rem)] font-bold text-[#f5e8c8]"

// 제목 한 줄 칸 (메모 칸 모양에서 높이만 뺌)
const TITLE_INPUT_CLASS = MEMO_CLASS.replace("min-h-[4.2rem] ", "").replace("resize-none ", "")

export default function InquiryForm({ form, setCategory, setTitle, setBody, send, isSending }) {
  const isError = form.status === "error"

  return (
    <div className="flex min-h-0 flex-col" data-testid="inquiry-form">
      <p className={LABEL_CLASS} id="inquiry-category-label">{INQUIRY_COPY.categoryLabel}</p>
      <div role="radiogroup" aria-labelledby="inquiry-category-label" className="mb-2 grid shrink-0 grid-cols-3 gap-[clamp(0.25rem,1cqi,0.4rem)]">
        {INQUIRY_CATEGORIES.map((item) => (
          <button key={item.code} type="button" role="radio" aria-checked={form.category === item.code}
            disabled={isSending} onClick={() => setCategory(item.code)}
            className={`${REASON_BTN_CLASS} ${form.category === item.code ? REASON_ON_CLASS : REASON_OFF_CLASS} ${FOCUS_RING_CLASS}`}>
            {item.label}
          </button>
        ))}
      </div>

      <label htmlFor="inquiry-title" className={LABEL_CLASS}>{INQUIRY_COPY.titleLabel}</label>
      <input id="inquiry-title" type="text" autoComplete="off" className={TITLE_INPUT_CLASS} value={form.title}
        maxLength={INQUIRY_TITLE_MAX} placeholder={INQUIRY_COPY.titlePlaceholder} disabled={isSending}
        onChange={(event) => setTitle(event.target.value)} data-testid="inquiry-title" />
      <p className={MEMO_COUNT_CLASS} aria-hidden="true">{form.title.length}/{INQUIRY_TITLE_MAX}</p>

      <label htmlFor="inquiry-body" className={LABEL_CLASS}>{INQUIRY_COPY.bodyLabel}</label>
      <textarea id="inquiry-body" className={`${MEMO_CLASS} min-h-[6.5rem]`} value={form.body} maxLength={INQUIRY_BODY_MAX}
        placeholder={INQUIRY_COPY.bodyPlaceholder} disabled={isSending}
        onChange={(event) => setBody(event.target.value)} data-testid="inquiry-body" />
      <p className={MEMO_COUNT_CLASS} aria-hidden="true">{form.body.length}/{INQUIRY_BODY_MAX}</p>

      {form.message ? (
        <p role={isError ? "alert" : "status"} data-testid="inquiry-message"
          className={`${MESSAGE_CLASS} ${MESSAGE_ERROR_CLASS}`}>{form.message}</p>
      ) : null}

      <button type="button" className={`${ACTION_BTN_CLASS} ${FOCUS_RING_CLASS} mt-1 shrink-0`} disabled={isSending}
        onClick={send} data-testid="inquiry-submit">
        <PublicAsset src={REPORT_BUTTON_ASSETS.cancel} alt="" className={ACTION_BTN_IMG_CLASS} />
        <span className={ACTION_BTN_LABEL_CLASS}>{isSending ? INQUIRY_COPY.sendingLabel : INQUIRY_COPY.submitLabel}</span>
      </button>
    </div>
  )
}
