// 설정 저장 결과 안내 띠: 문구 + 확인 버튼
// GameMatchingPage가 씀, 편집 창이 열려 있으면 페이지가 문구를 null로 넘겨 숨김
const NOTICE_CLASS =
  "absolute bottom-[clamp(4rem,11vh,6.5rem)] left-1/2 z-30 flex max-w-[min(38rem,90vw)] -translate-x-1/2 items-center gap-3 rounded-md border border-[#c9b892]/60 bg-black/75 px-4 py-2 text-[#f5f0e6]"

// 결과 안내 띠
export default function RoomSettingsResultNotice({ message, onDismiss }) {
  // 문구 없으면 안 그림
  if (typeof message !== "string" || message.length === 0) return null

  return (
    <div role="alert" aria-label="설정 저장 결과 안내" className={NOTICE_CLASS}>
      <span>{message}</span>
      {/* 닫기 함수 받았을 때만 확인 버튼 */}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="설정 저장 결과 안내 닫기"
          className="interactive-scale shrink-0 cursor-pointer rounded border border-[#c9b892]/60 px-2 py-1 font-bold"
        >
          확인
        </button>
      ) : null}
    </div>
  )
}
