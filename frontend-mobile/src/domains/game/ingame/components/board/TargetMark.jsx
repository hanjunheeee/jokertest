// 카드 위쪽 작은 띠: 내 투표·내 지목 표시
// CardSlot이 씀 (작은 카드에선 테두리 색만으로 알아보기 어려워 글로도 보임)
import { MARK_LABELS } from "./cardMarks.js"

const MARK_CLASS =
    "pointer-events-none absolute left-1/2 top-[6%] z-20 -translate-x-1/2 whitespace-nowrap rounded-sm border border-[#f3d28d]/80 bg-[#7a1414]/90 px-1 py-px font-subheading text-[0.58rem] font-bold leading-tight text-[#ffe2ad] shadow-[0_1px_4px_rgba(0,0,0,0.6)]"

// 표시 없으면 안 그림
export default function TargetMark({ mark }) {
    if (!mark) return null
    return <span className={MARK_CLASS}>{MARK_LABELS[mark]}</span>
}
