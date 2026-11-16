// 판 화면 초대 안내 한 줄: "○○ 님이 대기방으로 초대했습니다 … 로비로 가면 수락" + 닫기
// 인게임 화면이 씀, 죽은 사람만 초대를 받음 (산 사람에겐 서버가 안 보냄)
import { useInGameInviteNotice } from "../../hooks/useInGameInviteNotice.js"

// 위 가운데, 연출 창(z-45 이상)보다 아래라 투표·재판·밤 연출을 가리지 않음, 판 조작은 그대로 눌리게 겉은 클릭 통과
const WRAP_CLASS =
  "pointer-events-none absolute inset-x-0 top-[clamp(4.5rem,11vh,6.5rem)] z-[44] flex justify-center px-4"

// 거의 안 비치는 검정 판 위 크림 글 (어떤 그림 위에서도 대비 10 넘음), 전역 p 색에 안 묻히게 색을 줄에 직접 줌
const BOX_CLASS =
  "pointer-events-auto flex max-w-[min(34rem,92%)] items-center gap-3 rounded-md border border-[#d8b982]/60 bg-black/80 py-2 pl-4 pr-2 text-sm font-semibold leading-snug text-[#f5e8c8] shadow-[0_4px_14px_rgba(0,0,0,0.5)]"

const CLOSE_CLASS =
  "shrink-0 cursor-pointer rounded border border-[#d8b982]/60 bg-transparent px-2 py-1 text-xs font-semibold text-[#f5e8c8] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3d28d]"

// 읽기 도구가 새 글을 읽게 알림 칸(role="status")은 늘 두고 안 글만 바꿈
export default function InGameInviteNotice() {
  const { notice, dismiss } = useInGameInviteNotice()

  return (
    <div className={WRAP_CLASS} role="status" data-ingame-invite-notice-region="">
      {notice ? (
        <div className={BOX_CLASS} data-ingame-invite-notice={notice.id}>
          <span className="text-inherit">{notice.text}</span>
          <button type="button" className={CLOSE_CLASS} onClick={dismiss} aria-label="초대 안내 닫기">
            닫기
          </button>
        </div>
      ) : null}
    </div>
  )
}
