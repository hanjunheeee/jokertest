// 설정 저장 결과를 아직 모를 때 아래쪽에 뜨는 안내 + 결과 확인 버튼
// GameMatchingPage가 씀, 결과 확인 대기가 있을 때만 그림
export default function SettingsPendingNotice({ message, onVerify }) {
  return (
    <div
      role="status"
      className="absolute bottom-[clamp(4rem,11vh,6.5rem)] left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-md border border-[#c9b892]/60 bg-black/70 px-4 py-2 text-[#f5f0e6]"
    >
      <span>{message ?? "저장 결과를 확인하는 중입니다."}</span>
      <button
        type="button"
        onClick={onVerify}
        aria-label="설정 저장 결과 확인"
        className="interactive-scale cursor-pointer rounded border border-[#c9b892]/60 px-2 py-1 font-bold"
      >
        결과 확인
      </button>
    </div>
  )
}
