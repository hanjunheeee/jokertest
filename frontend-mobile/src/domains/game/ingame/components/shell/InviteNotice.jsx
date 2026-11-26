// 판 화면 초대 안내 한 줄: 죽은 사람이 받은 새 대기방 초대 안내("로비로 가면 수락") + 닫기
// InGamePage가 씀, 데스크톱 InGameInviteNotice와 같은 공용 훅(useInGameInviteNotice) 사용
import { useInGameInviteNotice } from "@/domains/game/ingame/hooks/useInGameInviteNotice.js"

// 위 줄 바로 아래 가운데, 연출·시트(z-55 이상)보다 아래라 연출을 가리지 않고 바깥은 손가락 통과
const WRAP_CLASS =
    "pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+3.25rem)] z-[50] flex justify-center px-3"

// 어두운 판 위 밝은 크림 글 (어떤 배경 그림 위에서도 대비 10 이상)
const BOX_CLASS =
    "pointer-events-auto flex w-full max-w-[28rem] items-center gap-2 rounded-md border border-[#d8b982]/60 bg-black/80 py-1.5 pl-3 pr-1.5 text-[0.8rem] font-semibold leading-snug text-[#f5e8c8] shadow-[0_4px_14px_rgba(0,0,0,0.5)]"

const CLOSE_CLASS =
    "flex min-h-11 shrink-0 cursor-pointer items-center rounded border border-[#d8b982]/60 bg-transparent px-2.5 text-xs font-semibold text-[#f5e8c8] active:bg-white/10"

// 읽기 도구가 새 글을 읽게 알림 칸(role="status")은 늘 두고 안 글만 바꿈
export default function InviteNotice() {
    const { notice, dismiss } = useInGameInviteNotice()

    return (
        <div className={WRAP_CLASS} role="status" data-ingame-invite-notice-region="">
            {notice ? (
                <div className={BOX_CLASS} data-ingame-invite-notice={notice.id}>
                    <span className="min-w-0 flex-1 text-inherit">{notice.text}</span>
                    <button type="button" className={CLOSE_CLASS} onClick={dismiss} aria-label="초대 안내 닫기">
                        닫기
                    </button>
                </div>
            ) : null}
        </div>
    )
}
