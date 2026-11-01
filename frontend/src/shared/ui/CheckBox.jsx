// 그림 체크박스 (칸 그림 위에 체크 표시 그림)
// settings 일반·소리 탭과 ingame 설정 창이 씀
import PublicAsset from "@/shared/ui/PublicAsset"

// 칸·체크 그림은 쓰는 쪽이 넘김, role=checkbox로 화면 읽기 지원
export default function CheckBox({
  checked,
  onChange,
  ariaLabel,
  checkboxSrc,
  checkMarkSrc,
  className = "relative block w-[clamp(1.75rem,2.45vw,2rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0",
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={className}
    >
      <PublicAsset
        src={checkboxSrc}
        alt=""
        className="block h-auto w-full select-none"
      />
      {/* 켜졌을 때만 체크 표시 */}
      {checked ? (
        <PublicAsset
          src={checkMarkSrc}
          alt=""
          className="pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"
        />
      ) : null}
    </button>
  )
}
