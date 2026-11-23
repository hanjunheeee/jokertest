// 문의 쓰기 폼 (모바일): 종류 셋·제목·내용·글자 수·안내 글·보내기 버튼
// InquirySheet가 useInquiries 값을 넘겨 씀, 글·검사는 데스크톱과 같음
import { REPORT_BUTTON_ASSETS } from "@/domains/report/constants/reportAssets.js"
import { INQUIRY_BODY_MAX, INQUIRY_CATEGORIES, INQUIRY_COPY, INQUIRY_TITLE_MAX } from "@/domains/inquiry/api/inquiry.api.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import {
  INQUIRY_BODY_MIN_H,
  INQUIRY_CATEGORY_CLASS,
  INQUIRY_CATEGORY_OFF,
  INQUIRY_CATEGORY_ON,
  INQUIRY_COUNT_CLASS,
  INQUIRY_FIELD_CLASS,
  INQUIRY_LABEL_CLASS,
  INQUIRY_MESSAGE_CLASS,
  INQUIRY_SUBMIT_BUTTON_LOOK,
} from "@m/domains/inquiry/inquiryMobileStyle.js"

export default function InquiryForm({ form, setCategory, setTitle, setBody, send, isSending }) {
  return (
    <div className="flex flex-col" data-testid="inquiry-form">
      <p className={INQUIRY_LABEL_CLASS} id="m-inquiry-category-label">{INQUIRY_COPY.categoryLabel}</p>
      <div role="radiogroup" aria-labelledby="m-inquiry-category-label" className="mb-1.5 grid grid-cols-3 gap-1">
        {INQUIRY_CATEGORIES.map((item) => (
          <button key={item.code} type="button" role="radio" aria-checked={form.category === item.code} disabled={isSending}
            onClick={() => setCategory(item.code)} className={`${INQUIRY_CATEGORY_CLASS} ${form.category === item.code ? INQUIRY_CATEGORY_ON : INQUIRY_CATEGORY_OFF}`}>
            {item.label}
          </button>
        ))}
      </div>

      <label htmlFor="m-inquiry-title" className={INQUIRY_LABEL_CLASS}>{INQUIRY_COPY.titleLabel}</label>
      <input id="m-inquiry-title" type="text" autoComplete="off" enterKeyHint="next" className={INQUIRY_FIELD_CLASS} value={form.title}
        maxLength={INQUIRY_TITLE_MAX} placeholder={INQUIRY_COPY.titlePlaceholder} disabled={isSending}
        onChange={(event) => setTitle(event.target.value)} data-testid="inquiry-title" />
      <p className={INQUIRY_COUNT_CLASS} aria-hidden="true">{form.title.length}/{INQUIRY_TITLE_MAX}</p>

      <label htmlFor="m-inquiry-body" className={INQUIRY_LABEL_CLASS}>{INQUIRY_COPY.bodyLabel}</label>
      <textarea id="m-inquiry-body" className={`${INQUIRY_FIELD_CLASS} ${INQUIRY_BODY_MIN_H} resize-none`} value={form.body}
        maxLength={INQUIRY_BODY_MAX} placeholder={INQUIRY_COPY.bodyPlaceholder} disabled={isSending}
        onChange={(event) => setBody(event.target.value)} data-testid="inquiry-body" />
      <p className={INQUIRY_COUNT_CLASS} aria-hidden="true">{form.body.length}/{INQUIRY_BODY_MAX}</p>

      {form.message ? (
        <p role={form.status === "error" ? "alert" : "status"} data-testid="inquiry-message" className={INQUIRY_MESSAGE_CLASS}>
          {form.message}
        </p>
      ) : null}

      <ImageButton look={INQUIRY_SUBMIT_BUTTON_LOOK} src={REPORT_BUTTON_ASSETS.cancel}
        label={isSending ? INQUIRY_COPY.sendingLabel : INQUIRY_COPY.submitLabel}
        disabled={isSending} onClick={send} data-testid="inquiry-submit" />
    </div>
  )
}
