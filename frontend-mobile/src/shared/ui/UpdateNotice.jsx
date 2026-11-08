// 새 버전 안내 띠 ("새 버전이 있어요" + 새로고침·나중에, 화면 아래 안전영역 위)
// 모바일 App이 라우터 옆에 띄움, 상태는 데스크톱 useAppVersionCheck (판 도중엔 안 뜸)
import { useAppVersionCheck } from "@/shared/hooks/useAppVersionCheck.js"

const BAR_CLASS =
  "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] z-[70] flex flex-wrap items-center justify-center gap-2 rounded-lg border border-[#8b6a3e] bg-[#f5f0e6] px-3 py-2 text-[#2b1d10] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
const TEXT_CLASS = "font-subheading font-bold app-text-scaled [--app-text-size:0.88rem]"
const BTN_BASE = "min-h-11 cursor-pointer rounded px-3 font-subheading font-bold app-text-scaled [--app-text-size:0.85rem]"

export default function UpdateNotice({ router }) {
  const { showNotice, reload, dismiss } = useAppVersionCheck({ router })
  if (!showNotice) return null
  return (
    <div role="status" className={BAR_CLASS}>
      <span className={TEXT_CLASS}>새 버전이 있어요. 새로고침하면 바로 적용돼요.</span>
      <button type="button" className={`${BTN_BASE} bg-[#5a3a1e] text-[#f5f0e6]`} onClick={reload}>새로고침</button>
      <button type="button" className={`${BTN_BASE} border border-[#8b6a3e] bg-transparent`} onClick={dismiss}>나중에</button>
    </div>
  )
}
