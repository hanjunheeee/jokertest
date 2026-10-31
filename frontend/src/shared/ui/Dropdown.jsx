import PublicAsset from "@/shared/ui/PublicAsset"

export default function Dropdown({
  value, // 화면에 표시할 현재 선택값 문자열
  inputFieldSrc, // 입력창처럼 보이는 배경 프레임 이미지 경로
  className = "relative shrink-0 w-[clamp(11.5rem,24vw,15rem)]", // 루트 요소 레이아웃 클래스
  valueClassName = "pointer-events-none absolute inset-0 flex items-center justify-between px-4 font-subheading app-text-scaled [--app-text-size:clamp(0.98rem,1.35vw,1.08rem)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]", // value 텍스트 스타일
}) {
  return (
    <div className={className}>
      <PublicAsset
        src={inputFieldSrc}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className={valueClassName}>
        <span>{value}</span>
        <span className="app-text-scaled [--app-text-size:0.8rem] opacity-90">▼</span>
      </span>
    </div>
  )
}
