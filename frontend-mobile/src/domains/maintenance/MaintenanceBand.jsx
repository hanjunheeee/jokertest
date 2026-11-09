// 점검 작은 띠 (휴대폰): 큰 안내를 닫은 뒤 화면 위(안전 영역 아래) 가운데에 남은 시간, 누르면 큰 안내 다시
// 모바일 MaintenanceNotice가 띄움 (띠 전체가 버튼 하나라 손가락으로 누르기 쉬움, 폭은 글만큼)
import { bandCopy } from "@/domains/maintenance/utils/noticeCopy.js"

const BAND_CLASS =
  "fixed left-1/2 top-[max(0.25rem,env(safe-area-inset-top,0px))] z-[96] flex min-h-11 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border border-[#8b6a3e] bg-[#f5f0e6]/95 px-4 text-[#2b1d10] shadow-[0_4px_14px_rgba(0,0,0,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2b1d10]"
const TEXT_CLASS = "whitespace-nowrap font-subheading app-text-scaled [--app-text-size:0.8rem] font-bold tabular-nums"
const MORE_CLASS = "whitespace-nowrap font-subheading app-text-scaled [--app-text-size:0.72rem] underline"

export default function MaintenanceBand({ view }) {
  const text = bandCopy(view)
  return (
    <button
      type="button"
      aria-label={`${text}, 점검 안내 자세히 보기`}
      className={BAND_CLASS}
      data-maintenance-band=""
      onClick={view.reopen}
    >
      <span className={TEXT_CLASS}>{text}</span>
      <span aria-hidden="true" className={MORE_CLASS}>자세히</span>
    </button>
  )
}
