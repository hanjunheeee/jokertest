// 위 단계 줄 (카톡형): "제 2일 · 낮 토론 0:45" 한 줄, 누르면 진행 바 펼침·접기
// TalkLayout이 위 줄 오른쪽에 씀, 날짜·단계 글·남은 시간은 진행 바와 같은 선택 함수 (1초마다 셈)
import { usePhaseClock } from "@m/domains/game/ingame/hooks/timebar/usePhaseClock.js"

// 지금 그림 분위기(어두운 판 + 금빛 테두리)에 맞춘 알약 모양, 누르는 높이 44px
const PILL_CLASS =
    "flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[#b08a4a]/70 bg-black/55 px-2.5 text-[#f3dcb0] shadow-[inset_0_0_8px_rgba(0,0,0,0.6)] active:scale-[0.99]"

// "[낮-토론과 투표]" → "낮 토론" (위 줄 버튼 옆이라 폭이 좁음 → 세부는 첫 낱말만, 전체 글은 펼친 진행 바에)
function plainLabel(statusLabel) {
    if (!statusLabel) return ""
    const [kind, detail = ""] = statusLabel.replace(/^\[|\]$/g, "").split("-")
    // "토론과 투표" → "토론" (첫 낱말 끝 이음말 '과·와' 뗌)
    const firstWord = (detail.trim().split(/\s+/)[0] ?? "").replace(/[과와]$/, "")
    return firstWord ? `${kind} ${firstWord}` : kind
}

// 남은 초 → "0:38" (분 앞 0 뺌, 좁은 줄이라)
function shortClock(totalSec) {
    const sec = Math.max(0, Math.floor(totalSec))
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`
}

// expanded·onToggle은 TalkLayout이 가짐 (펼친 진행 바는 아래 timebar 자리에 그림)
export default function PhaseLine({ expanded, onToggle }) {
    const bar = usePhaseClock()
    const label = plainLabel(bar.statusLabel)
    const hasTime = Number.isFinite(bar.remainingSec) && bar.remainingSec >= 0
    const urgent = hasTime && bar.remainingSec <= 10

    return (
        <button
            type="button"
            className={PILL_CLASS}
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`제 ${bar.day}일 ${label} 진행 바 ${expanded ? "접기" : "펼치기"}`}
            data-talk-phase-line=""
        >
            <span className="shrink-0 font-subheading text-[0.8rem] font-bold">제 {bar.day}일</span>
            {label ? <span aria-hidden className="shrink-0 opacity-50">·</span> : null}
            {label ? <span className="min-w-0 truncate text-[0.8rem]">{label}</span> : null}
            {hasTime ? (
                <span className={`shrink-0 font-mono text-[0.85rem] tabular-nums ${urgent ? "text-[#ff8a6a]" : ""}`.trim()}>
                    {shortClock(bar.remainingSec)}
                </span>
            ) : null}
        </button>
    )
}
