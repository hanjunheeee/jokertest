// 판 화면 초대 안내 한 줄: "○○ 님이 대기방으로 초대했습니다 … 로비로 가면 수락" + 닫기 (데스크톱 InGameInviteNotice와 같은 글·같은 규칙)
// InGamePage가 씀, 죽은 사람만 초대를 받음 (산 사람에겐 서버가 안 보냄)
import { useInGameInviteNotice } from "@/domains/game/ingame/hooks/useInGameInviteNotice.js"

// 위 줄(높이 3rem) 바로 아래 가운데, 연출·시트(z-55 이상)보다 아래라 재판·밤 연출을 가리지 않음, 겉은 손가락 통과
const WRAP_CLASS =
    "pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+3.25rem)] z-[50] flex justify-center px-3"

// 거의 안 비치는 검정 판 위 크림 글 (어떤 그림 위에서도 대비 10 넘음), 전역 p 색에 안 묻히게 색을 줄에 직접 줌
const BOX_CLASS =
    "pointer-events-auto flex w-full max-w-[28rem] items-center gap-2 rounded-md border border-[#d8b982]/60 bg-black/80 py-1.5 pl-3 pr-1.5 text-[0.8rem] font-semibold leading-snug text-[#f5e8c8] shadow-[0_4px_14px_rgba(0,0,0,0.5)]"

// 손가락으로 누르기 편한 44px 닫기
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
