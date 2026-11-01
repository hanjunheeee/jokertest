// 인증 화면 그림 버튼 (버튼 그림 위에 글자 얹기 선택)
// 로그인·가입·소셜 가입·아이디 찾기·재설정 폼 컴포넌트들이 사용
import PublicAsset from "@/shared/ui/PublicAsset";

const AUTH_BTN_IMG_CLASS = "block h-auto w-full select-none"

// 기본 눌림 효과 (잠기면 크기 그대로)
const BTN_INTERACTION_CLASS =
  "transition-transform duration-200 ease-out hover:scale-[1.05] active:scale-[0.95] disabled:hover:scale-100 disabled:active:scale-100"

// 얹은 글자 정렬, 좌우는 그림 가장자리 피해 안쪽으로 (모르는 값은 가운데)
const VISIBLE_LABEL_ALIGN_CLASS = {
  left: "justify-start text-left pl-[14%]",
  center: "justify-center text-center",
  right: "justify-end text-right pr-[14%]",
}

// label은 읽어 주는 이름, visibleLabel 있을 때만 글자 얹음, inline이면 줄 안 버튼
export default function AuthImageButton({
  src,
  label,
  className = "",
  type = "button",
  onClick,
  disabled = false,
  visibleLabel,
  visibleLabelClassName = "text-sm",
  visibleLabelAlign = "center",
  inline = false,
  interactionClassName = BTN_INTERACTION_CLASS,
  ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`relative border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-60 ${interactionClassName} ${
        inline ? "inline-block w-auto shrink-0 cursor-pointer" : "mx-auto block w-[92%] cursor-pointer"
      } ${className}`}
      {...rest}
    >
      <PublicAsset src={src} alt="" className={AUTH_BTN_IMG_CLASS} />

      {visibleLabel && (
        <span className={`pointer-events-none absolute inset-0 flex items-center font-subheading font-bold text-white ${VISIBLE_LABEL_ALIGN_CLASS[visibleLabelAlign] ?? VISIBLE_LABEL_ALIGN_CLASS.center} ${visibleLabelClassName}`}>
          {visibleLabel}
        </span>
      )}
    </button>
  )
}
