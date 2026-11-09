// 점검 큰 안내 (데스크톱): 화면 가운데 큰 창(점검 시각·남은 시간·강제 종료 안내), 닫으면 위쪽 띠
// app/App.jsx가 라우터 옆에 한 번 띄움, 상태·신호는 useMaintenanceNotice
import { useMaintenanceNotice } from "../hooks/useMaintenanceNotice.js"
import { useNoticeFocus } from "../hooks/useNoticeFocus.js"
import { bigNoticeCopy } from "../utils/noticeCopy.js"
import MaintenanceBand from "./MaintenanceBand.jsx"

const BACKDROP_CLASS = "fixed inset-0 z-[130] flex items-center justify-center bg-black/65 px-4"
const PANEL_CLASS =
  "w-full max-w-[34rem] rounded-md border-2 border-[#8b6a3e] bg-[#efe3c8] px-8 py-7 text-center text-[#2b1d10] shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
const TITLE_CLASS = "font-display app-text-scaled [--app-text-size:28px] font-bold"
const LINE_CLASS = "mt-2 font-subheading app-text-scaled [--app-text-size:15px] break-keep"
const COUNT_LABEL_CLASS = "mt-5 font-subheading app-text-scaled [--app-text-size:14px] text-[#5a3a1e]"
const COUNT_CLASS = "font-display app-text-scaled [--app-text-size:48px] font-bold tabular-nums leading-tight"
const WARN_CLASS = "mt-4 font-subheading app-text-scaled [--app-text-size:16px] font-bold text-[#7a1f12] break-keep"
const BUTTON_CLASS =
  "mt-6 cursor-pointer rounded bg-[#5a3a1e] px-6 py-2 font-subheading app-text-scaled [--app-text-size:15px] font-bold text-[#f5f0e6] hover:bg-[#6d4826] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2b1d10]"

// 큰 창 하나 (예약·점검 중·강제 종료 셋 다 이 모양)
function NoticeDialog({ view }) {
  const copy = bigNoticeCopy(view)
  const act = view.mode === "forced" ? view.confirm : view.close
  const { buttonRef, onKeyDown } = useNoticeFocus(view.openKey, act)
  const scheduled = view.mode === "big" && view.state === "scheduled"
  return (
    <div className={BACKDROP_CLASS}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="maintenance-notice-title"
        aria-describedby="maintenance-notice-detail"
        className={PANEL_CLASS}
        data-maintenance-notice={view.mode}
        onKeyDown={onKeyDown}
      >
        <h2 id="maintenance-notice-title" className={TITLE_CLASS}>{copy.title}</h2>
        {scheduled ? (
          <>
            <p className={COUNT_LABEL_CLASS}>점검까지 남은 시간</p>
            <p className={COUNT_CLASS} data-maintenance-remaining="">{view.remainingText}</p>
            <p className={LINE_CLASS}>점검 시각: {view.startsAtText}</p>
          </>
        ) : null}
        {view.mode !== "forced" && view.message ? <p className={LINE_CLASS}>{view.message}</p> : null}
        <p id="maintenance-notice-detail" className={scheduled ? WARN_CLASS : LINE_CLASS}>{copy.detail}</p>
        <button ref={buttonRef} type="button" className={BUTTON_CLASS} onClick={act}>{copy.button}</button>
      </div>
    </div>
  )
}

export default function MaintenanceNotice({ socket, navigate }) {
  const view = useMaintenanceNotice(socket, { navigate })
  if (view.mode === "none") return null
  if (view.mode === "band") return <MaintenanceBand view={view} />
  return <NoticeDialog view={view} />
}
