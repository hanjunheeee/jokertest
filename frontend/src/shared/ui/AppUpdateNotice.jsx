// 새 버전 안내 띠 ("새 버전이 있어요" + 새로고침·나중에, 화면 아래 가운데)
// 데스크톱 App이 라우터 옆에 띄움, 상태는 useAppVersionCheck
import { useAppVersionCheck } from "@/shared/hooks/useAppVersionCheck.js"

const BAR_CLASS =
  "fixed bottom-4 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-3 rounded-md border border-[#8b6a3e] bg-[#efe3c8] px-4 py-2 text-[#2b1d10] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
const TEXT_CLASS = "font-subheading app-text-scaled [--app-text-size:13px] font-bold"
const RELOAD_BTN_CLASS =
  "cursor-pointer rounded bg-[#5a3a1e] px-3 py-1 font-subheading app-text-scaled [--app-text-size:12px] font-bold text-[#f5f0e6] hover:bg-[#6d4826]"
const LATER_BTN_CLASS =
  "cursor-pointer rounded border border-[#8b6a3e] bg-transparent px-2 py-1 font-subheading app-text-scaled [--app-text-size:12px] text-[#2b1d10] hover:bg-black/5"

export default function AppUpdateNotice({ router }) {
  const { showNotice, reload, dismiss } = useAppVersionCheck({ router })
  if (!showNotice) return null
  return (
    <div role="status" className={BAR_CLASS}>
      <span className={TEXT_CLASS}>새 버전이 있어요. 새로고침하면 바로 적용돼요.</span>
      <button type="button" className={RELOAD_BTN_CLASS} onClick={reload}>새로고침</button>
      <button type="button" className={LATER_BTN_CLASS} onClick={dismiss}>나중에</button>
    </div>
  )
}
