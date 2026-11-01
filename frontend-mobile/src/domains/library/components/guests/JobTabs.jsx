// 직업 고르기 탭 다섯 개 (데스크톱 탭 버튼 그림, 폰 폭에 맞춰 다섯 칸 균등)
// pages/LibraryPage.jsx가 초대받은 자들 탭 양피지 머리 칸에 씀
import { INVITED_GUESTS_JOB_SPREAD_META } from "@/shared/constants/jobSpreadMeta.js"
import { INVITED_GUESTS_ASSETS } from "@/domains/library/constants/invitedGuests/assets.js"
import {
  JOB_TAB_ACTIVE_CLASS,
  JOB_TAB_INACTIVE_CLASS,
  JOB_TAB_LABEL_CLASS,
} from "@m/domains/library/constants/guestsStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 고른 탭은 수락 버튼 그림·밝은 글자, 나머지는 미선택 그림
export default function JobTabs({ activeIndex, onSelect }) {
  return (
    <div className="grid grid-cols-5 gap-1" role="tablist" aria-label="직업 선택">
      {INVITED_GUESTS_JOB_SPREAD_META.map(({ id, jobLabel }, index) => {
        const active = index === activeIndex
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={jobLabel}
            onClick={() => onSelect(index)}
            className="relative flex min-h-11 min-w-0 items-center justify-center border-0 bg-transparent px-0.5 leading-none transition-transform duration-150 active:scale-95"
          >
            <PublicAsset
              src={active ? INVITED_GUESTS_ASSETS.jobTabActive : INVITED_GUESTS_ASSETS.jobTabInactive}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
            />
            <span
              className={`${JOB_TAB_LABEL_CLASS} ${active ? JOB_TAB_ACTIVE_CLASS : JOB_TAB_INACTIVE_CLASS}`}
            >
              {jobLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}
