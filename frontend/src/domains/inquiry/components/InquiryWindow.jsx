// 문의 창 (데스크톱): 투표 창 틀 + 내 문의·문의 쓰기 칸 바꾸기 + 목록·하나 보기·쓰기 폼 (body에 띄움)
// 로비 메뉴(LobbyMenuNav)가 고객센터 누름·알림 문의 답 주소로 엶
import { useRef } from "react"
import { createPortal } from "react-dom"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { useInGameModalLayer } from "@/domains/game/ingame/hooks/useInGameModalLayer.js"
import { REPORT_FRAME_ASSETS } from "@/domains/report/constants/reportAssets.js"
import {
  BACKDROP_CLASS, CLOSE_BTN_CLASS, CLOSE_BTN_IMG_CLASS, FRAME_IMG_CLASS, getReportPanelStyle,
  PANEL_INNER_CLASS, PANEL_INSET, REASON_BTN_CLASS, REASON_OFF_CLASS, REASON_ON_CLASS, SHELL_CLASS, TITLE_CLASS, WRAP_CLASS,
} from "@/domains/report/constants/reportLayout.js"
import { INQUIRY_COPY } from "../api/inquiry.api.js"
import { useInquiries } from "../hooks/useInquiries.js"
import InquiryDetail from "./InquiryDetail.jsx"
import InquiryForm from "./InquiryForm.jsx"
import InquiryList from "./InquiryList.jsx"

const INQUIRY_FOCUS_RING_CLASS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"

// 위쪽 칸 바꾸기 버튼 둘 (하나 보기는 내 문의 칸으로 셈)
function ViewTabs({ view, showList, showForm }) {
  const tabs = [
    { key: "list", label: INQUIRY_COPY.listTab, on: view !== "form", onClick: showList },
    { key: "form", label: INQUIRY_COPY.formTab, on: view === "form", onClick: showForm },
  ]
  return (
    <div className="mb-2 grid shrink-0 grid-cols-2 gap-[clamp(0.25rem,1cqi,0.4rem)]">
      {tabs.map((tab) => (
        <button key={tab.key} type="button" aria-pressed={tab.on} onClick={tab.onClick} data-testid={`inquiry-tab-${tab.key}`}
          className={`${REASON_BTN_CLASS} ${tab.on ? REASON_ON_CLASS : REASON_OFF_CLASS} ${INQUIRY_FOCUS_RING_CLASS}`}>
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// open·onClose는 로비 메뉴가, targetId는 알림 주소의 문의 id, api는 시험이 갈아끼움
export default function InquiryWindow({ open, onClose, targetId = null, api }) {
  const dialogRef = useRef(null)
  const state = useInquiries({ open, targetId, api })
  useInGameModalLayer({ open, onClose, containerRef: dialogRef })
  if (!open || typeof document === "undefined" || !document.body) return null

  return createPortal(
    <div className={SHELL_CLASS} role="presentation">
      <button type="button" aria-label={INQUIRY_COPY.closeLabel} tabIndex={-1} className={BACKDROP_CLASS} data-sfx-kind="ui-cancel" onClick={onClose} />
      <div className={WRAP_CLASS}>
        <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={INQUIRY_COPY.title}
          className={PANEL_INNER_CLASS} style={getReportPanelStyle()} data-testid="inquiry-window">
          <PublicAsset src={REPORT_FRAME_ASSETS.panelFrame} alt="" className={FRAME_IMG_CLASS} />
          <h2 className={TITLE_CLASS}>{INQUIRY_COPY.title}</h2>
          <button type="button" aria-label={INQUIRY_COPY.closeLabel} onClick={onClose} data-sfx-kind="ui-cancel"
            className={`${CLOSE_BTN_CLASS} ${INQUIRY_FOCUS_RING_CLASS}`}>
            <PublicAsset src={REPORT_FRAME_ASSETS.closeButton} alt="" className={CLOSE_BTN_IMG_CLASS} />
          </button>

          <div className="absolute inset-0 z-[2] flex min-h-0 flex-col" style={PANEL_INSET}>
            <ViewTabs view={state.view} showList={state.showList} showForm={state.showForm} />
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pr-1">
              {state.view === "form" ? <InquiryForm {...state} /> : null}
              {state.view === "detail" ? <InquiryDetail detail={state.detail} onBack={state.showList} /> : null}
              {state.view === "list" ? (
                <InquiryList list={state.list} notice={state.notice} onOpen={state.openDetail} onReload={state.reloadList} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
