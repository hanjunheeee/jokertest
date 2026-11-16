// 방 만들기·코드 입장 실패 안내 띠: 까닭 글 + 확인 버튼
// GameSetupPage·RoomInvitePage가 씀, 브라우저 알림 창을 닫은 뒤에도 까닭(탈주 대기 등)이 화면에 남고 화면 읽기도 읽게 함

// 화면 위쪽 가운데에 띄움 (아래쪽에 두면 만들기·참여하기 버튼을 가려서)
const NOTICE_CLASS =
  "absolute left-1/2 top-[clamp(0.75rem,2.5vh,1.5rem)] z-30 flex max-w-[min(38rem,90vw)] -translate-x-1/2 items-center gap-3 rounded-md border border-[#c9b892]/60 bg-black/75 px-4 py-2 text-[#f5f0e6]"

// 실패 안내 띠 (문구 없으면 안 그림)
export default function EntryFailureNotice({ message, onDismiss }) {
  if (typeof message !== "string" || message.length === 0) return null

  return (
    <div role="alert" data-testid="entry-failure-notice" className={NOTICE_CLASS}>
      <span>{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="interactive-scale shrink-0 cursor-pointer rounded border border-[#c9b892]/60 px-2 py-1 font-bold"
        >
          확인
        </button>
      ) : null}
    </div>
  )
}
