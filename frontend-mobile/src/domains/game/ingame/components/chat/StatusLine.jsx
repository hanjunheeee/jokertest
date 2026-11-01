// 채팅 상태 줄: 보내기 실패 글 > 전송 중 > 못 보내는 까닭(읽기 전용·채팅 없음)
// ChatPanel·CloseupSheet가 씀, 데스크톱 상태 줄에 읽기 전용 안내를 더함
const LINE_CLASS = "shrink-0 truncate px-3 pb-1 pt-0.5 font-subheading text-[0.74rem] font-bold leading-tight"

// 셋 다 없으면 안 그림
export default function StatusLine({ status = null, error = null, blockedReason = null }) {
    if (error) {
        return (
            <p className={`${LINE_CLASS} text-[#a01818]`} role="alert">
                {error}
            </p>
        )
    }
    if (status === "sending") {
        return (
            <p className={`${LINE_CLASS} text-[#3a1a0c]/75`} role="status">
                전송 중…
            </p>
        )
    }
    if (blockedReason) {
        return <p className={`${LINE_CLASS} text-[#3a1a0c]/65`}>{blockedReason}</p>
    }
    return null
}
