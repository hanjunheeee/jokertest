// 채팅 칸 머리 줄: 채널 배지 + 크게 보기(또는 닫기) 버튼
// ChatPanel·CloseupSheet가 씀
import ChannelBadge from "./ChannelBadge.jsx"
import { HEADER_CLASS, ICON_BTN_CLASS } from "./chatStyle.js"

// 크게 보기 아이콘 (네 귀퉁이 화살표)
function ExpandIcon() {
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
    )
}

// action은 오른쪽 버튼 자리 (칸에선 크게 보기, 시트에선 닫기)
export default function ChatHeader({ channel, onExpand = null, action = null, className = "" }) {
    return (
        <div className={`${HEADER_CLASS} ${className}`.trim()}>
            <div className="min-w-0 flex-1">
                <ChannelBadge tone={channel.tone} label={channel.label} readOnly={channel.readOnly} />
            </div>
            {onExpand ? (
                <button
                    type="button"
                    className={ICON_BTN_CLASS}
                    aria-label="채팅 크게 보기"
                    onClick={onExpand}
                >
                    <ExpandIcon />
                </button>
            ) : null}
            {action}
        </div>
    )
}
