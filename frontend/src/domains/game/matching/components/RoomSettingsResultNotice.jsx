// 파일 역할: RoomSettingsResultNotice.jsx - 저장 결과를 끝내 확인하지 못했을 때의 대기방 안내입니다.
/**
 * F-20(AC-05 / A-07): 설정 저장의 **결말을 알 수 없다**는 사실을 대기방에 남기는 안내.
 *
 * 왜 별도의 자리가 필요한가: ACK를 잃은 저장은 "결과 확인" 대기 표시로 이어지지만, 그 확인이
 * 서버 기록 만료·재시작으로 UNKNOWN으로 끝나면 대기 표시가 사라지고 편집 패널도 저장 직후의
 * 잠금으로 이미 닫혀 있다. 그 순간 결론을 보여줄 자리가 없으면, 방장은 아무 안내도 없이
 * "저장됐다"고 오해한다. 그래서 대기와 패널 어느 쪽에도 묶이지 않은 이 자리에 남긴다.
 *
 * 무엇을 말하지 않는가: 적용됐다/안 됐다를 단정하지 않는다(서버도 모르는 사실이다). 자동으로
 * 다시 저장하지도 않는다 — 다시 저장할지는 현재 설정을 본 방장이 결정한다. 문구에는 요청
 * 식별자·기록·응답 코드 같은 내부 용어를 쓰지 않는다.
 */
const NOTICE_CLASS =
  "absolute left-1/2 top-[calc(50%+21.5rem)] z-30 flex max-w-[min(38rem,90vw)] -translate-x-1/2 items-center gap-3 rounded-md border border-[#c9b892]/60 bg-black/75 px-4 py-2 text-[#f5f0e6]"

/**
 * @param {{message?: string|null, onDismiss?: () => void}} props
 *   message가 없으면 아무것도 그리지 않는다(없는 안내를 자리만 만들어 두지 않는다).
 */
export default function RoomSettingsResultNotice({ message, onDismiss }) {
  if (typeof message !== "string" || message.length === 0) return null

  return (
    <div role="alert" aria-label="설정 저장 결과 안내" className={NOTICE_CLASS}>
      <span>{message}</span>
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
