// 파일 역할: SettingIntroSkipLayer.jsx - 화면을 구성하는 컴포넌트입니다.
/** 설정 인트로 영상이 끝나기 전에 클릭해서 건너뛰는 투명 레이어입니다. */
export default function SettingIntroSkipLayer({ visible, onSkip }) {
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
