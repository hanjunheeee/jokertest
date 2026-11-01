// 받은 게임 초대 알림 띠 (누르면 친구 시트, X로 이번 초대만 닫기)
// BottomBar가 대기 초대가 있을 때 씀
// 수락·거절은 친구 시트 초대 탭이 맡음 (여기선 알리기만)
export default function InviteAlert({ invite, count, onOpen, onDismiss }) {
    const sender = invite.senderName ?? "친구"
    const more = count > 1 ? ` 외 ${count - 1}건` : ""

    return (
        <div
            role="status"
            className="mx-auto flex w-full min-w-0 max-w-md items-center land:flex-1 gap-1 rounded-md border border-[#c9a45c]/60 bg-[#2a0d06]/90 pl-3 shadow-[0_4px_14px_rgba(0,0,0,0.6)]"
        >
            <button
                type="button"
                onClick={onOpen}
                className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
            >
                <span className="min-w-0 truncate font-subheading text-sm font-bold text-[#ebe2cc]">
                    {sender} 님의 게임 초대{more}
                </span>
                <span className="ml-auto shrink-0 font-subheading text-sm font-bold text-[#e7c27a] underline underline-offset-2">
                    보기
                </span>
            </button>
            <button
                type="button"
                aria-label="초대 알림 닫기"
                onClick={onDismiss}
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-lg leading-none text-[#ebe2cc]/80"
            >
                ×
            </button>
        </div>
    )
}
