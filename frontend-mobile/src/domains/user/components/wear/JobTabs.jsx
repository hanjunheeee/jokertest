// 직업 고르기 탭 줄 (가로 스크롤, 고른 탭은 긍정 버튼 그림)
// WearSheet가 씀
import { INVITED_GUESTS_ASSETS } from "@/domains/library/constants/invitedGuests/assets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 서고 직업 탭과 같은 그림, 폰 폭에 다 안 들어가면 옆으로 밀어 봄
export default function JobTabs({ tabs, activeIndex, onSelect, disabled }) {
  return (
    <div
      role="tablist"
      aria-label="직업 선택"
      className="flex shrink-0 gap-1.5 overflow-x-auto overscroll-x-contain px-4 py-2 [scrollbar-width:none]"
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
            disabled={disabled}
            onClick={() => onSelect(index)}
            className="relative h-11 w-[5.5rem] shrink-0 border-0 bg-transparent p-0 leading-none active:scale-95"
          >
            <PublicAsset
              src={active ? INVITED_GUESTS_ASSETS.jobTabActive : INVITED_GUESTS_ASSETS.jobTabInactive}
              alt=""
              className="absolute inset-0 block h-full w-full select-none object-fill"
            />
            <span
              className={`absolute inset-0 flex items-center justify-center font-subheading text-sm font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.75)] ${
                active ? "text-[#e8f0dc]" : "text-[#ebe2cc]/90"
              }`}
            >
              {jobLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}
