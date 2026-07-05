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
  checked, // 현재 체크 여부 (true/false) — 부모 컴포넌트가 값을 소유하는 제어 컴포넌트
  onChange, // 클릭해서 값이 바뀔 때 호출할 콜백. 새 체크 상태(!checked)를 인자로 넘겨줌
  ariaLabel, // 스크린리더가 읽어줄 설명
  checkboxSrc, // 체크박스 배경 이미지 경로
  checkMarkSrc, // 체크됐을 때 위에 덧그릴 체크 표시 이미지 경로
  className = "relative block w-[clamp(1.75rem,2.45vw,2rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0",
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      // 클릭할 때마다 현재 checked 값을 반전시켜 부모에게 알림 (실제 상태는 부모가 관리)
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
