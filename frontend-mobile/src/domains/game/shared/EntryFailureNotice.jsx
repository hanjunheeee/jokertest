// 코드 입장·방 만들기 실패 안내 띠: 거절 까닭 문구와 확인 단추 표시
// RoomInvitePage가 사용, 양피지 알림을 닫은 뒤에도 실패 사유가 화면에 남아 읽히게 함
const NOTICE_CLASS =
  "mx-auto mt-1 flex w-[min(36rem,calc(100%-1.5rem))] shrink-0 items-center justify-between gap-2.5 rounded-md border border-[#c9b892]/65 bg-[#120a06]/90 px-3.5 py-2 text-[#f5f0e6]"

// 실패 문구가 있을 때만 상단 안내 띠 표시
export default function EntryFailureNotice({ message, onDismiss }) {
  if (typeof message !== "string" || message.length === 0) return null

  return (
    <div role="alert" data-testid="entry-failure-notice" className={NOTICE_CLASS}>
      <span className="min-w-0 flex-1 font-subheading app-text-scaled [--app-text-size:0.85rem] font-semibold leading-snug text-[#f5f0e6]">
        {message}
      </span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-9 shrink-0 cursor-pointer rounded border border-[#c9b892]/65 bg-[#2a1a10] px-2.5 py-1 font-subheading app-text-scaled [--app-text-size:0.8rem] font-bold text-[#f5f0e6] active:scale-95"
        >
          확인
        </button>
      ) : null}
    </div>
  )
}
