/**
 * 드롭다운 표시 UI — 입력창 PNG 위에 현재 값·▼만 표시
 * GeneralSettingsTab에서 사용
 *
 * props
 * - value: 표시할 선택값 문자열
 * - inputFieldSrc: 입력창 프레임 이미지
 * - className, valueClassName: 레이아웃·텍스트 스타일
 *
 * 미구현 (TODO: 클릭·옵션 목록·onChange)
 */
import PublicAsset from "@/shared/ui/PublicAsset"

/** 읽기 전용 드롭다운 형태 라벨 (선택 변경 불가) */
export default function Dropdown({
  value,
  inputFieldSrc,
  className = "relative shrink-0 w-[clamp(11.5rem,24vw,15rem)]",
  valueClassName = "pointer-events-none absolute inset-0 flex items-center justify-between px-4 font-subheading text-[clamp(0.98rem,1.35vw,1.08rem)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
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
        <span className="text-[0.8rem] opacity-90">▼</span>
      </span>
    </div>
  )
}
