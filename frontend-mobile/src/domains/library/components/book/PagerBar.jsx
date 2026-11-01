// 바닥 쪽 넘김 줄 (이전 화살표·지금 쪽 이름·다음 화살표)
// pages/LibraryPage.jsx가 ShellBottom 안에 넣음
import { LIBRARY_ASSETS } from "@/domains/library/constants/libraryAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { TAP_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 화살표 버튼 하나 (끝 쪽이면 잠그고 흐리게), 다음은 그림을 뒤집음
function ArrowButton({ label, disabled, onClick, flip = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`${TAP_CLASS} w-16 disabled:opacity-25`}
    >
      <PublicAsset
        src={LIBRARY_ASSETS.pageArrow}
        alt=""
        className={`block h-auto w-full select-none ${flip ? "rotate-180" : ""}`}
      />
    </button>
  )
}

// title은 큰 글자(기록 번호 등), sub는 작은 글자(앞면·뒷면 이름)
export default function PagerBar({ title, sub, canPrev, canNext, onPrev, onNext }) {
  return (
    <nav
      aria-label="페이지 이동"
      className="flex items-center justify-between gap-2 border-t border-[#c9a46a]/25 bg-black/80 px-3 py-1 safe-pb"
    >
      <ArrowButton label="이전 페이지" disabled={!canPrev} onClick={onPrev} />
      <p className="m-0 flex min-w-0 flex-col items-center text-center leading-tight" aria-live="polite">
        <span className="truncate font-display app-text-scaled [--app-text-size:1rem] text-[#f0e6d8]">{title}</span>
        {sub ? (
          <span className="truncate font-subheading app-text-scaled [--app-text-size:0.78rem] text-[#f0e6d8]/70">{sub}</span>
        ) : null}
      </p>
      <ArrowButton label="다음 페이지" disabled={!canNext} onClick={onNext} flip />
    </nav>
  )
}
