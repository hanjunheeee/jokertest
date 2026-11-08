// 로그인 상태 유지 체크 (그림 상자 + 체크 표시)
// login/LoginOptions.jsx가 씀
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 그림 상자를 쓰려고 진짜 checkbox 대신 button + role=checkbox, 누르는 자리 44px
export default function RememberMe({ checked, onChange }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-8 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 pl-1"
    >
      <span className="relative flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center">
        <PublicAsset src={LOGIN_ASSETS.checkbox} alt="" className="pointer-events-none h-[1.125rem] w-[1.125rem] select-none" />
        {checked ? (
          <svg className="pointer-events-none absolute h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : null}
      </span>
      <span className="font-subheading font-bold whitespace-nowrap text-text-body app-text-scaled [--app-text-size:14px]">로그인 상태 유지</span>
    </button>
  )
}
