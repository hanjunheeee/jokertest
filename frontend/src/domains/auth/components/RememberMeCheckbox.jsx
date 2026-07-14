import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// "로그인 상태 유지" 선택 여부를 보여주는 이미지 체크박스입니다.
export default function RememberMeCheckbox({ checked, onChange }) {
  // 현재 체크 상태를 반대로 바꿔 부모 컴포넌트에 알려줍니다.
  const toggle = () => onChange(!checked)

  return (
    <button
      type="button"
      role="checkbox"
      // 버튼을 체크박스처럼 쓰고 있으므로, 화면 읽기 프로그램에 현재 체크 상태를 알려줍니다.
      aria-checked={checked}
      onClick={toggle}
      className="group flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0"
    >
      {/* 체크박스 배경 이미지와 체크 표시를 겹쳐 놓는 영역입니다. */}
      <span className="interactive-scale-sm relative flex h-4 w-4 shrink-0 items-center justify-center">
        <PublicAsset src={LOGIN_ASSETS.checkbox} alt="" className="pointer-events-none h-4 w-4 select-none" />

        {/* checked가 true일 때만 흰색 체크 표시를 보여줍니다. */}
        {checked ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white" aria-hidden="true">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
        ) : null}
      </span>

      <span className="font-subheading text-[13px] font-bold text-text-body">로그인 상태 유지</span>
    </button>
  )
}
