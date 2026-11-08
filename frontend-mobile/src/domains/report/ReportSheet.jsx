// 신고 창 (모바일): 투표 창 틀 겹 창 + 대상 이름·사유 네 칸·메모·안내 글·신고/취소 버튼
// 전적 시트·결과 목록이 데스크톱 useGameReport 값(dialog)을 넘겨 씀, 글·사유·판단은 데스크톱과 같음
import { REPORT_BUTTON_ASSETS } from "@/domains/report/constants/reportAssets.js"
import { REPORT_COPY, REPORT_MEMO_MAX, REPORT_REASONS } from "@/domains/report/constants/reportCopy.js"
import VoteFrameModal from "@m/shared/ui/modal/VoteFrameModal.jsx"
import { SUBTITLE_CLASS } from "@m/shared/ui/modal/voteFrameStyle.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { CONFIRM_BUTTON_LOOK, ERROR_CLASS, NOTE_CLASS } from "@m/domains/game/matching/constants/voteFrameStyle.js"

const REASON_CLASS =
  "min-h-11 cursor-pointer rounded-sm border px-1 font-subheading app-text-scaled [--app-text-size:0.88rem] font-bold leading-none text-white disabled:cursor-default disabled:opacity-70"
const REASON_ON = "border-[#f3d28d] bg-[#3a1410]/80 text-[#f5e8c8]"
const REASON_OFF = "border-[#3a2818]/75 bg-[#120a06]/55"
const MEMO_CLASS =
  "min-h-[5.5rem] w-full resize-none rounded-sm border border-[#3a2818]/75 bg-[#120a06]/70 p-2 font-subheading app-text-scaled [--app-text-size:0.9rem] leading-snug text-white outline-none placeholder:text-white/40 focus-visible:border-[#f3d28d]"

export default function ReportSheet({ dialog }) {
  const { isOpen, target, reasonCode, memo, status, message, isSending, isDone, close, setReason, setMemo, send } = dialog
  // 접수·중복은 안내 모양, 입력·서버 오류는 경고 모양
  const isError = status === "error"

  return (
    <VoteFrameModal open={isOpen} onClose={close} title={REPORT_COPY.title} closeLabel={REPORT_COPY.closeAriaLabel} testId="report-sheet">
      <p className="mt-1 truncate text-center font-subheading app-text-scaled [--app-text-size:1.05rem] font-bold text-[#f5e8c8]" data-testid="report-target">
        {target?.nickname || target?.uuid}
      </p>
      <p className={SUBTITLE_CLASS}>{REPORT_COPY.subtitle}</p>

      <div role="radiogroup" aria-label={REPORT_COPY.reasonGroupLabel} className="mb-2 grid grid-cols-2 gap-1.5">
        {REPORT_REASONS.map((reason) => (
          <button
            key={reason.code}
            type="button"
            role="radio"
            aria-checked={reasonCode === reason.code}
            disabled={isSending || isDone}
            onClick={() => setReason(reason.code)}
            className={`${REASON_CLASS} ${reasonCode === reason.code ? REASON_ON : REASON_OFF}`}
          >
            {reason.label}
          </button>
        ))}
      </div>

      <textarea
        aria-label={REPORT_COPY.memoLabel}
        className={MEMO_CLASS}
        value={memo}
        maxLength={REPORT_MEMO_MAX}
        placeholder={REPORT_COPY.memoPlaceholder}
        disabled={isSending || isDone}
        onChange={(event) => setMemo(event.target.value)}
      />
      <p className="mb-1 text-right font-subheading text-[0.75rem] tabular-nums text-white/55" aria-hidden="true">
        {memo.length}/{REPORT_MEMO_MAX}
      </p>

      {message ? (
        <p
          role={isError ? "alert" : "status"}
          data-testid="report-message"
          className={`mb-2 text-center ${isError ? ERROR_CLASS : `${NOTE_CLASS} text-[#e8f0dc]`}`}
        >
          {message}
        </p>
      ) : null}

      <div className={`grid gap-2 ${isDone ? "grid-cols-1" : "grid-cols-2"}`}>
        {isDone ? null : (
          <ImageButton
            look={CONFIRM_BUTTON_LOOK}
            src={REPORT_BUTTON_ASSETS.report}
            label={isSending ? REPORT_COPY.sendingLabel : REPORT_COPY.submitLabel}
            disabled={isSending}
            onClick={send}
            data-testid="report-submit"
          />
        )}
        <ImageButton
          look={CONFIRM_BUTTON_LOOK}
          src={REPORT_BUTTON_ASSETS.cancel}
          sfxKind="ui-cancel"
          label={isDone ? REPORT_COPY.closeLabel : REPORT_COPY.cancelLabel}
          onClick={close}
          data-testid="report-cancel"
        />
      </div>
    </VoteFrameModal>
  )
}
