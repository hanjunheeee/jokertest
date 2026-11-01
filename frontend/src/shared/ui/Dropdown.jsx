// 값 칸 그림 + 값 + ▼ 표시만 있는 모양 (펼치는 기능은 없음)
// 지금 화면에서는 안 씀, 글자 배율 시험만 불러옴
import PublicAsset from "@/shared/ui/PublicAsset"

// 보여 주기만 하고 값 바꾸기는 안 받음
export default function Dropdown({
  value,
  inputFieldSrc,
  className = "relative shrink-0 w-[clamp(11.5rem,24vw,15rem)]",
  valueClassName = "pointer-events-none absolute inset-0 flex items-center justify-between px-4 font-subheading app-text-scaled [--app-text-size:clamp(0.98rem,1.35vw,1.08rem)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
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
