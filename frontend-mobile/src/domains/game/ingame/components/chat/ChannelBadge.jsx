// 채널 표시 배지: 낮·광대 밤·직업 밤·죽은 자·없음 + 읽기 전용 표시
// ChatHeader가 씀, 채널은 단계·생존·직업으로 정해져 고르는 탭 대신 표시만 함
const TONE_CLASS = {
    day: "border-[#b07a2a] bg-[#f3dfa8] text-[#5a3410]",
    joker: "border-[#d04a3a] bg-[#5a0d0d] text-[#ffd9c4]",
    night: "border-[#5a72a8] bg-[#1e2a44] text-[#d9e3ff]",
    dead: "border-[#8a8a8a] bg-[#3a3a3a] text-[#e4e4e4]",
    off: "border-[#8a7a60] bg-[#cbbd9e] text-[#4a3a26]",
}

// 채널 종류별 작은 점 색 (색만으로 구분 안 하게 이름도 같이 씀)
const DOT_CLASS = {
    day: "bg-[#e0a020]",
    joker: "bg-[#ff5a3c]",
    night: "bg-[#8fb0ff]",
    dead: "bg-[#bdbdbd]",
    off: "bg-[#7a6a50]",
}

// 이름 + 읽기 전용이면 작은 꼬리표
export default function ChannelBadge({ tone, label, readOnly }) {
    return (
        <div className="flex min-w-0 items-center gap-1.5" role="status" aria-live="polite">
            <span
                className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-subheading text-[0.78rem] font-bold leading-none ${TONE_CLASS[tone] ?? TONE_CLASS.off}`}
            >
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[tone] ?? DOT_CLASS.off}`} />
                <span className="truncate">{label}</span>
            </span>
            {readOnly ? (
                <span className="shrink-0 rounded-full border border-[#3a1a0c]/30 px-2 py-1 font-subheading text-[0.7rem] font-bold leading-none text-[#3a1a0c]/80">
                    읽기 전용
                </span>
            ) : null}
        </div>
    )
}
