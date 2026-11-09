// 점검 큰 안내 (휴대폰): 양피지 큰 창(점검 시각·남은 시간·강제 종료 안내), 닫으면 위쪽 띠
// 모바일 app/App.jsx가 라우터 옆에 한 번 띄움, 상태·신호·문구는 데스크톱 maintenance 것을 같이 씀
import { createPortal } from "react-dom"
import { useMaintenanceNotice } from "@/domains/maintenance/hooks/useMaintenanceNotice.js"
import { useNoticeFocus } from "@/domains/maintenance/hooks/useNoticeFocus.js"
import { bigNoticeCopy } from "@/domains/maintenance/utils/noticeCopy.js"
import ConfirmButton from "@m/shared/ui/modal/parchment/ConfirmButton.jsx"
import ParchmentFrame from "@m/shared/ui/modal/parchment/ParchmentFrame.jsx"
import MaintenanceBand from "@m/domains/maintenance/MaintenanceBand.jsx"

// 화면 틀(.mobile-shell) 안 fixed가 틀에 갇혀서 body로 뺌
const BACKDROP_CLASS = "fixed inset-0 z-[130] bg-black/70"
const WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[131] flex items-center justify-center px-[max(0.5rem,env(safe-area-inset-left,0px))] py-[max(0.5rem,env(safe-area-inset-top,0px))]"
const TITLE_CLASS = "font-display app-text-scaled [--app-text-size:1.35rem] font-bold text-[#3a1a0c] break-keep"
const LINE_CLASS = "px-1 font-subheading app-text-scaled [--app-text-size:0.85rem] font-semibold leading-relaxed text-[#3a1a0c]/90 break-keep"
const COUNT_CLASS = "font-display app-text-scaled [--app-text-size:2.2rem] font-bold tabular-nums leading-tight text-[#3a1a0c]"
const WARN_CLASS = "px-1 font-subheading app-text-scaled [--app-text-size:0.92rem] font-bold leading-snug text-[#7a1f12] break-keep"

// 큰 창 하나 (예약·점검 중·강제 종료 셋 다 이 모양)
function NoticeDialog({ view }) {
  const copy = bigNoticeCopy(view)
  const act = view.mode === "forced" ? view.confirm : view.close
  const { buttonRef, onKeyDown } = useNoticeFocus(view.openKey, act)
  const scheduled = view.mode === "big" && view.state === "scheduled"
  return (
    <div data-maintenance-notice={view.mode}>
      <div aria-hidden="true" className={BACKDROP_CLASS} />
      <div className={WRAP_CLASS}>
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="maintenance-notice-title"
          aria-describedby="maintenance-notice-detail"
          className="pointer-events-auto max-w-full"
          onKeyDown={onKeyDown}
        >
          <ParchmentFrame>
            <h2 id="maintenance-notice-title" className={TITLE_CLASS}>{copy.title}</h2>
            {scheduled ? (
              <>
                <p className={LINE_CLASS}>점검까지 남은 시간</p>
                <p className={COUNT_CLASS} data-maintenance-remaining="">{view.remainingText}</p>
                <p className={LINE_CLASS}>점검 시각: {view.startsAtText}</p>
              </>
            ) : null}
            {view.mode !== "forced" && view.message ? <p className={LINE_CLASS}>{view.message}</p> : null}
            <p id="maintenance-notice-detail" className={scheduled ? WARN_CLASS : LINE_CLASS}>{copy.detail}</p>
            <ConfirmButton ref={buttonRef} label={copy.button} onClick={act} raised />
          </ParchmentFrame>
        </div>
      </div>
    </div>
  )
}

export default function MaintenanceNotice({ socket, navigate }) {
  const view = useMaintenanceNotice(socket, { navigate })
  if (view.mode === "none") return null
  const body = view.mode === "band" ? <MaintenanceBand view={view} /> : <NoticeDialog view={view} />
  return createPortal(body, document.body)
}
