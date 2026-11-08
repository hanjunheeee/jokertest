// 가운데 창 틀 (어두운 뒤판 + 양피지 색 창, body에 포털로 띄움, Esc·뒤판으로 닫기)
// 약관 전체 보기·재동의·탈퇴 확인·새 버전 안내 창이 씀 (데스크톱)
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useDialogFocus } from "@/shared/hooks/useDialogFocus.js"

const BACKDROP_CLASS = "fixed inset-0 z-[90] bg-black/70"
const SHELL_CLASS = "pointer-events-none fixed inset-0 z-[91] flex items-center justify-center px-4"
const PANEL_CLASS =
  "pointer-events-auto flex max-h-[min(80vh,40rem)] w-full max-w-[min(34rem,92vw)] flex-col gap-3 rounded-md border border-[#8b6a3e] bg-[#efe3c8] p-[clamp(1rem,2vw,1.4rem)] text-[#2b1d10] shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
const TITLE_CLASS = "font-subheading app-text-scaled [--app-text-size:clamp(0.95rem,1.3vw,1.1rem)] font-bold"

// closable이 거짓이면 Esc·뒤판으로 못 닫음 (재동의처럼 꼭 답해야 하는 창)
export default function CenterDialog({ open, title, onClose, closable = true, children, labelledBy = "center-dialog-title" }) {
  const panelRef = useRef(null)
  useDialogFocus(Boolean(open), panelRef)

  useEffect(() => {
    if (!open || !closable) return undefined
    const onKey = (event) => { if (event.key === "Escape") onClose?.() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, closable, onClose])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <>
      <div className={BACKDROP_CLASS} aria-hidden="true" onClick={closable ? onClose : undefined} />
      <div className={SHELL_CLASS}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          style={{ outline: "none" }}
          className={PANEL_CLASS}
        >
          <h2 id={labelledBy} className={TITLE_CLASS}>{title}</h2>
          {children}
        </div>
      </div>
    </>,
    document.body,
  )
}
