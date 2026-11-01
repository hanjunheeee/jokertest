// 인트로 영상 위를 덮는 투명 건너뛰기 버튼
// settings 설정 화면과 store 상점 화면이 씀
export default function SettingIntroSkipLayer({ visible, onSkip }) {
  // 인트로가 끝나면 안 그림
  if (!visible) return null

  return (
    <button
      type="button"
      aria-label="인트로 건너뛰기"
      onClick={onSkip}
      className="absolute inset-0 z-30 cursor-pointer border-0 bg-transparent p-0"
    />
  )
}
