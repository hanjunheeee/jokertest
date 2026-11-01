// 화면 바닥에 고정한 그림 버튼 하나 (제출 또는 안내 화면의 다음 동작)
// pages/FindIdPage·PasswordResetRequestPage·PasswordResetPage가 씀
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

// 그림별 폭: 넓은 프레임2는 줄 폭, 짧은 프레임1은 비율 지키려고 좁게
const WIDTH_CLASS = {
  wide: "w-[min(100%,21rem)]",
  narrow: "w-[min(100%,13rem)]",
}

// formId 주면 그 form 제출 버튼(바깥에 있어도 Enter 제출 됨), 아니면 onClick 버튼
export default function BottomAction({
  label,
  src = "/button/버튼 프레임2.png",
  width = "wide",
  formId,
  onClick,
  disabled = false,
}) {
  return (
    <ShellBottom>
      <div className="flex justify-center bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 pb-3 pt-3 land:pb-2 land:pt-1">
        <button
          type={formId ? "submit" : "button"}
          form={formId}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={`relative min-h-11 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform duration-200 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${WIDTH_CLASS[width] ?? WIDTH_CLASS.wide}`}
        >
          <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
          <span className="app-text-scaled pointer-events-none absolute inset-0 flex items-center justify-center font-subheading font-bold text-white [--app-text-size:16px]">
            {label}
          </span>
        </button>
      </div>
    </ShellBottom>
  )
}
