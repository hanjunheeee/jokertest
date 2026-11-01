// 새 메시지 알림 단추: 위로 올려 읽는 중에 메시지가 오면 목록 아래에 뜸
// MessageList가 씀, 누르면 맨 아래로
export default function NewMessagePill({ count, onClick }) {
    if (count <= 0) return null

    return (
        <button
            type="button"
            onClick={onClick}
            className="absolute bottom-1.5 left-1/2 z-[2] flex h-11 -translate-x-1/2 cursor-pointer items-center gap-1 rounded-full border border-[#e0b46a]/70 bg-[#2a1810]/92 px-4 font-subheading text-[0.8rem] font-bold text-[#f3e6c8] shadow-[0_2px_8px_rgba(0,0,0,0.5)] active:scale-95"
        >
            새 메시지 {count > 99 ? "99+" : count}
            <span aria-hidden="true">↓</span>
        </button>
    )
}
