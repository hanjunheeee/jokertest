// 채팅 상태 줄: 오류 문구나 '전송 중' 한 줄, 틀 가운데 나무 띠 위에 얹음 (데스크톱 상태 줄 자리)
// ChatPanel·Composer가 씀, 글자 모양·문구는 데스크톱 InGameChatStatusLine과 같음
const WRAP_CLASS = "pointer-events-none absolute inset-x-[8%] z-[1] flex items-center justify-center"
const LINE_CLASS = "truncate px-1 text-[11px] leading-none text-white/80"

// 오류 먼저, 보내는 중이면 전송 중, 둘 다 아니면 안 그림 (placeStyle은 띠 자리)
export default function StatusLine({ status = null, error = null, placeStyle }) {
    const text = error ?? (status === "sending" ? "전송 중" : null)
    if (!text) return null

    return (
        <div className={WRAP_CLASS} style={placeStyle}>
            <p className={LINE_CLASS} role={error ? "alert" : "status"}>
                {text}
            </p>
        </div>
    )
}
