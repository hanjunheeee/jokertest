// 신고 창 (데스크톱): 투표 창 틀 + 대상 이름·사유 네 칸·메모·안내 글·신고/취소 버튼 (body에 띄움)
// 전적 목록·결과 참가자 목록이 useReportDialog 값(dialog)을 넘겨 씀
import { useRef } from "react"
import { createPortal } from "react-dom"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { useInGameModalLayer } from "@/domains/game/ingame/hooks/useInGameModalLayer.js"
import { REPORT_BUTTON_ASSETS, REPORT_FRAME_ASSETS } from "../constants/reportAssets.js"
import { REPORT_COPY, REPORT_MEMO_MAX, REPORT_REASONS } from "../constants/reportCopy.js"
import {
  ACTION_BTN_CLASS, ACTION_BTN_IMG_CLASS, ACTION_BTN_LABEL_CLASS, ACTIONS_CLASS, BACKDROP_CLASS, CLOSE_BTN_CLASS,
  CLOSE_BTN_IMG_CLASS, FRAME_IMG_CLASS, getReportPanelStyle, MEMO_CLASS, MEMO_COUNT_CLASS, MESSAGE_CLASS,
  MESSAGE_ERROR_CLASS, MESSAGE_OK_CLASS, PANEL_INNER_CLASS, PANEL_INSET, REASON_BTN_CLASS, REASON_GRID_CLASS,
  REASON_OFF_CLASS, REASON_ON_CLASS, SHELL_CLASS, SUBTITLE_CLASS, TARGET_CLASS, TITLE_CLASS, WRAP_CLASS,
} from "../constants/reportLayout.js"

const FOCUS_RING_CLASS = "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"

// 그림 버튼 하나 (아래 버튼 줄)
function FrameButton({ src, label, disabled, onClick, sfxKind, testId }) {
  return (
    <button type="button" className={`${ACTION_BTN_CLASS} ${FOCUS_RING_CLASS}`} disabled={disabled} onClick={onClick}
      data-sfx-kind={sfxKind} data-testid={testId}>
      <PublicAsset src={src} alt="" className={ACTION_BTN_IMG_CLASS} />
      <span className={ACTION_BTN_LABEL_CLASS}>{label}</span>
    </button>
  )
}

export default function ReportDialog({ dialog }) {
  const dialogRef = useRef(null)
  const { isOpen, target, reasonCode, memo, status, message, isSending, isDone, close, setReason, setMemo, send } = dialog
  useInGameModalLayer({ open: isOpen, onClose: close, containerRef: dialogRef })
  if (!isOpen || typeof document === "undefined" || !document.body) return null

  // 접수·중복은 안내 모양, 입력·서버 오류는 경고 모양
  const isError = status === "error"
  return createPortal(
    <div className={SHELL_CLASS} role="presentation">
      <button type="button" aria-label={REPORT_COPY.closeAriaLabel} className={BACKDROP_CLASS} data-sfx-kind="ui-cancel" onClick={close} />
      <div className={WRAP_CLASS}>
        <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={REPORT_COPY.title}
          className={`${PANEL_INNER_CLASS} pointer-events-auto`} style={getReportPanelStyle()}
          onClick={(event) => event.stopPropagation()} data-testid="report-dialog">
          <PublicAsset src={REPORT_FRAME_ASSETS.panelFrame} alt="" className={FRAME_IMG_CLASS} />
          <h2 className={TITLE_CLASS}>{REPORT_COPY.title}</h2>
          <button type="button" aria-label={REPORT_COPY.closeAriaLabel} onClick={close} data-sfx-kind="ui-cancel"
            className={`${CLOSE_BTN_CLASS} ${FOCUS_RING_CLASS}`}>
            <PublicAsset src={REPORT_FRAME_ASSETS.closeButton} alt="" className={CLOSE_BTN_IMG_CLASS} />
          </button>

          <div className="absolute inset-0 z-[2] flex min-h-0 flex-col overflow-y-auto overscroll-contain" style={PANEL_INSET}>
            <p className={TARGET_CLASS} data-testid="report-target">{target?.nickname || target?.uuid}</p>
            <p className={SUBTITLE_CLASS}>{REPORT_COPY.subtitle}</p>

            <div role="radiogroup" aria-label={REPORT_COPY.reasonGroupLabel} className={REASON_GRID_CLASS}>
              {REPORT_REASONS.map((reason) => (
                <button key={reason.code} type="button" role="radio" aria-checked={reasonCode === reason.code}
                  disabled={isSending || isDone} onClick={() => setReason(reason.code)}
                  className={`${REASON_BTN_CLASS} ${reasonCode === reason.code ? REASON_ON_CLASS : REASON_OFF_CLASS} ${FOCUS_RING_CLASS}`}>
                  {reason.label}
                </button>
              ))}
            </div>

            <textarea aria-label={REPORT_COPY.memoLabel} className={MEMO_CLASS} value={memo} maxLength={REPORT_MEMO_MAX}
              placeholder={REPORT_COPY.memoPlaceholder} disabled={isSending || isDone} onChange={(event) => setMemo(event.target.value)} />
            <p className={MEMO_COUNT_CLASS} aria-hidden="true">{memo.length}/{REPORT_MEMO_MAX}</p>

            {message ? (
              <p role={isError ? "alert" : "status"} data-testid="report-message"
                className={`${MESSAGE_CLASS} ${isError ? MESSAGE_ERROR_CLASS : MESSAGE_OK_CLASS}`}>{message}</p>
            ) : null}

            <div className={ACTIONS_CLASS}>
              {isDone ? null : (
                <FrameButton src={REPORT_BUTTON_ASSETS.report} label={isSending ? REPORT_COPY.sendingLabel : REPORT_COPY.submitLabel}
                  disabled={isSending} onClick={send} testId="report-submit" />
              )}
              <FrameButton src={REPORT_BUTTON_ASSETS.cancel} label={isDone ? REPORT_COPY.closeLabel : REPORT_COPY.cancelLabel}
                onClick={close} sfxKind="ui-cancel" testId="report-cancel" />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
