// 채팅 크게 보기 버튼: 틀 오른쪽 위 나무 귀퉁이의 작은 네 귀 화살표 (글 위를 안 가림)
// ChatPanel이 씀, 데스크톱은 틀을 눌러 열고 hover로 알려 주는데 폰은 hover가 없어서 눈에 보이는 자리로 둠
import { ICON_BTN_CLASS } from "./chatStyle.js"

// 틀 누름(빈 곳)도 그대로 크게 보기라 버튼 누름은 틀로 안 번지게 막음
export default function ExpandButton({ onOpen }) {
    return (
        <button
            type="button"
            aria-label="채팅 크게 보기"
            data-chat-interactive
            className={`${ICON_BTN_CLASS} absolute top-0 right-0 z-[2] items-start justify-end pt-[3px] pr-[3px] text-[#e9b582]/80`}
            onClick={(event) => {
                event.stopPropagation()
                onOpen()
            }}
        >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
        </button>
    )
}
