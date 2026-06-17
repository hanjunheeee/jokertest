/**
 * 이미지 체크박스 — 체크 시 checkMark 오버레이
 * GeneralSettingsTab 등 설정 화면에서 사용 (에셋은 호출부에서 주입)
 *
 * props
 * - checked, onChange: 토글 상태
 * - ariaLabel: 접근성
 * - checkboxSrc, checkMarkSrc: PNG 경로
 * - className: button 루트 클래스
 */
import PublicAsset from "@/shared/ui/PublicAsset"

/** 체크박스·체크표시 이미지로 on/off 표시하는 토글 버튼 */
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
