// 점검 작은 띠 (데스크톱): 큰 안내를 닫은 뒤 화면 위 가운데에 남은 시간 계속, 누르면 큰 안내 다시
// MaintenanceNotice가 띄움 (판 화면을 덜 가리게 낮은 높이)
import { bandCopy } from "../utils/noticeCopy.js"

const BAND_CLASS =
  "fixed left-1/2 top-2 z-[96] flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#8b6a3e] bg-[#efe3c8]/95 py-1 pl-4 pr-1 text-[#2b1d10] shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
const TEXT_CLASS = "font-subheading app-text-scaled [--app-text-size:13px] font-bold tabular-nums"
const BUTTON_CLASS =
  "cursor-pointer rounded-full bg-[#5a3a1e] px-3 py-0.5 font-subheading app-text-scaled [--app-text-size:12px] font-bold text-[#f5f0e6] hover:bg-[#6d4826] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2b1d10]"

export default function MaintenanceBand({ view }) {
  return (
    <div role="region" aria-label="점검 안내" className={BAND_CLASS} data-maintenance-band="">
      <span className={TEXT_CLASS}>{bandCopy(view)}</span>
      <button type="button" className={BUTTON_CLASS} onClick={view.reopen}>자세히</button>
    </div>
  )
}
