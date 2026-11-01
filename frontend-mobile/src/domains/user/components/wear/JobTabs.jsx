// 직업 고르기 탭 줄 (가로 스크롤, 고른 탭은 긍정 버튼 그림)
// WearSheet가 씀
import { INVITED_GUESTS_ASSETS } from "@/domains/library/constants/invitedGuests/assets.js"
import {
  JOB_TAB_BG_IMG_CLASS,
  JOB_TAB_LABEL_ACTIVE_CLASS,
  JOB_TAB_LABEL_INACTIVE_CLASS,
} from "@/domains/library/constants/invitedGuests/layoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 서고 직업 탭 버튼 모양, 높이만 44px
const BTN_CLASS =
  "interactive-scale relative inline-flex h-11 min-w-[3.6rem] shrink-0 items-center justify-center border-0 bg-transparent px-2 leading-none whitespace-nowrap"

// 데스크톱 탭 글자(JOB_TAB_LABEL_CLASS)에서 크기만 폰에서 읽히게 키움
const LABEL_CLASS =
  "relative z-10 font-subheading text-[0.8125rem] font-bold tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 데스크톱 서고 직업 탭(InvitedGuestsJobTabs)과 같은 그림·글자색, 폰 폭에 다 안 들어가면 옆으로 밀어 봄
export default function JobTabs({ tabs, activeIndex, onSelect }) {
  return (
    <div
      role="tablist"
      aria-label="직업 선택"
      className="flex shrink-0 gap-1 overflow-x-auto overscroll-x-contain px-3 py-2 [scrollbar-width:none] land:px-0"
    >
      {tabs.map(({ id, jobLabel }, index) => {
        const active = index === activeIndex
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={jobLabel}
            onClick={() => onSelect(index)}
            className={BTN_CLASS}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={active ? INVITED_GUESTS_ASSETS.jobTabActive : INVITED_GUESTS_ASSETS.jobTabInactive}
              alt=""
              className={JOB_TAB_BG_IMG_CLASS}
            />
            <span className={`${LABEL_CLASS} ${active ? JOB_TAB_LABEL_ACTIVE_CLASS : JOB_TAB_LABEL_INACTIVE_CLASS}`}>
              {jobLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}
