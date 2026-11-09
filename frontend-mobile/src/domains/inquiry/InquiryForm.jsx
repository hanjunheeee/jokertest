// 문의 쓰기 폼 (모바일): 종류 셋·제목·내용·글자 수·안내 글·보내기 버튼
// InquirySheet가 useInquiries 값을 넘겨 씀, 글·검사는 데스크톱과 같음
import { REPORT_BUTTON_ASSETS } from "@/domains/report/constants/reportAssets.js"
import { INQUIRY_BODY_MAX, INQUIRY_CATEGORIES, INQUIRY_COPY, INQUIRY_TITLE_MAX } from "@/domains/inquiry/api/inquiry.api.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { CONFIRM_BUTTON_LOOK, ERROR_CLASS } from "@m/domains/game/matching/constants/voteFrameStyle.js"

const CATEGORY_CLASS =
  "min-h-11 cursor-pointer rounded-sm border px-1 font-subheading app-text-scaled [--app-text-size:0.88rem] font-bold leading-none text-white disabled:cursor-default disabled:opacity-70"
const CATEGORY_ON = "border-[#f3d28d] bg-[#3a1410]/80 text-[#f5e8c8]"
const CATEGORY_OFF = "border-[#3a2818]/75 bg-[#120a06]/55"
const LABEL_CLASS = "mb-1 block font-subheading app-text-scaled [--app-text-size:0.88rem] font-bold text-[#f5e8c8]"
// 폰 글자 16px 이상이라 입력할 때 화면이 확대되지 않음
const FIELD_CLASS =
  "w-full rounded-sm border border-[#3a2818]/75 bg-[#120a06]/70 p-2 font-subheading text-base leading-snug text-white outline-none placeholder:text-white/40 focus-visible:border-[#f3d28d]"
const COUNT_CLASS = "mb-1 text-right font-subheading text-[0.75rem] tabular-nums text-white/55"

export default function InquiryForm({ form, setCategory, setTitle, setBody, send, isSending }) {
  return (
    <div className="flex flex-col" data-testid="inquiry-form">
      <p className={LABEL_CLASS} id="m-inquiry-category-label">{INQUIRY_COPY.categoryLabel}</p>
      <div role="radiogroup" aria-labelledby="m-inquiry-category-label" className="mb-2 grid grid-cols-3 gap-1.5">
        {INQUIRY_CATEGORIES.map((item) => (
          <button key={item.code} type="button" role="radio" aria-checked={form.category === item.code} disabled={isSending}
            onClick={() => setCategory(item.code)} className={`${CATEGORY_CLASS} ${form.category === item.code ? CATEGORY_ON : CATEGORY_OFF}`}>
            {item.label}
          </button>
        ))}
      </div>

      <label htmlFor="m-inquiry-title" className={LABEL_CLASS}>{INQUIRY_COPY.titleLabel}</label>
      <input id="m-inquiry-title" type="text" autoComplete="off" enterKeyHint="next" className={FIELD_CLASS} value={form.title}
        maxLength={INQUIRY_TITLE_MAX} placeholder={INQUIRY_COPY.titlePlaceholder} disabled={isSending}
        onChange={(event) => setTitle(event.target.value)} data-testid="inquiry-title" />
      <p className={COUNT_CLASS} aria-hidden="true">{form.title.length}/{INQUIRY_TITLE_MAX}</p>

      <label htmlFor="m-inquiry-body" className={LABEL_CLASS}>{INQUIRY_COPY.bodyLabel}</label>
      <textarea id="m-inquiry-body" className={`${FIELD_CLASS} min-h-[7rem] resize-none`} value={form.body}
        maxLength={INQUIRY_BODY_MAX} placeholder={INQUIRY_COPY.bodyPlaceholder} disabled={isSending}
        onChange={(event) => setBody(event.target.value)} data-testid="inquiry-body" />
      <p className={COUNT_CLASS} aria-hidden="true">{form.body.length}/{INQUIRY_BODY_MAX}</p>

      {form.message ? (
        <p role={form.status === "error" ? "alert" : "status"} data-testid="inquiry-message" className={`mb-2 text-center ${ERROR_CLASS}`}>
          {form.message}
        </p>
      ) : null}

      <ImageButton look={CONFIRM_BUTTON_LOOK} src={REPORT_BUTTON_ASSETS.cancel}
        label={isSending ? INQUIRY_COPY.sendingLabel : INQUIRY_COPY.submitLabel}
        disabled={isSending} onClick={send} data-testid="inquiry-submit" />
    </div>
  )
}
