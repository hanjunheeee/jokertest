import PublicAsset from "@/shared/ui/PublicAsset"

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
