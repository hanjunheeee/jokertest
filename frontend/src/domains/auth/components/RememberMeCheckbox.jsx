import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function RememberMeCheckbox({ checked, onChange }) {
  const toggle = () => onChange(!checked)

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={toggle}
      className="group flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0"
    >
      <span className="interactive-scale-sm relative flex h-4 w-4 shrink-0 items-center justify-center">
        <PublicAsset src={LOGIN_ASSETS.checkbox} alt="" className="pointer-events-none h-4 w-4 select-none" />

        {checked ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white" aria-hidden="true">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
        ) : null}
      </span>

      <span className="font-subheading app-text-scaled [--app-text-size:13px] font-bold text-text-body">로그인 상태 유지</span>
    </button>
  )
}
