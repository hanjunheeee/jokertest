// 문의 창 (모바일): 투표 창 틀 겹 창 + 내 문의·문의 쓰기 칸 바꾸기 + 목록·하나 보기·쓰기 폼
// 로비 메뉴(MenuNav)가 고객센터 누름·알림 문의 답 주소로 엶, 상태·글은 데스크톱 useInquiries 그대로
import { INQUIRY_COPY } from "@/domains/inquiry/api/inquiry.api.js"
import { useInquiries } from "@/domains/inquiry/hooks/useInquiries.js"
import VoteFrameModal from "@m/shared/ui/modal/VoteFrameModal.jsx"
import InquiryForm from "@m/domains/inquiry/InquiryForm.jsx"
import InquiryList, { InquiryDetailView } from "@m/domains/inquiry/InquiryList.jsx"
import {
  INQUIRY_SHEET_BACKDROP_CLASS,
  INQUIRY_TAB_CLASS,
  INQUIRY_TAB_OFF,
  INQUIRY_TAB_ON,
} from "@m/domains/inquiry/inquiryMobileStyle.js"

// open·onClose는 로비 메뉴가, targetId는 알림 주소의 문의 id, api는 시험이 갈아끼움
export default function InquirySheet({ open, onClose, targetId = null, api }) {
  const state = useInquiries({ open, targetId, api })
  // 하나 보기는 내 문의 칸으로 셈
  const tabs = [
    { key: "list", label: INQUIRY_COPY.listTab, on: state.view !== "form", onClick: state.showList },
    { key: "form", label: INQUIRY_COPY.formTab, on: state.view === "form", onClick: state.showForm },
  ]

  return (
    <VoteFrameModal
      open={open}
      onClose={onClose}
      title={INQUIRY_COPY.title}
      closeLabel={INQUIRY_COPY.closeLabel}
      testId="inquiry-window"
      backdropClassName={INQUIRY_SHEET_BACKDROP_CLASS}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 mt-0.5 grid shrink-0 grid-cols-2 gap-1">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" aria-pressed={tab.on} onClick={tab.onClick} data-testid={`inquiry-tab-${tab.key}`}
              className={`${INQUIRY_TAB_CLASS} ${tab.on ? INQUIRY_TAB_ON : INQUIRY_TAB_OFF}`}>
              {tab.label}
            </button>
          ))}
        </div>
        {state.view === "form" ? <InquiryForm {...state} /> : null}
        {state.view === "detail" ? <InquiryDetailView detail={state.detail} onBack={state.showList} /> : null}
        {state.view === "list" ? (
          <InquiryList list={state.list} notice={state.notice} onOpen={state.openDetail} onReload={state.reloadList} />
        ) : null}
      </div>
    </VoteFrameModal>
  )
}
