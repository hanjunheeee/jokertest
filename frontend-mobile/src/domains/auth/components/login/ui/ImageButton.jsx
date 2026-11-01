// 그림 버튼 (버튼 그림 위에 글자 얹기 선택), 데스크톱 AuthImageButton의 모바일판
// 로그인·소셜·가입 버튼, 중복확인·인증번호 받기 버튼이 씀
import PublicAsset from "@/shared/ui/PublicAsset"

// 그림은 버튼 크기에 맞춰 늘림, 최소 높이 44px로 누르는 자리 확보
export default function ImageButton({
  src, label, visibleLabel, labelClassName = "app-text-scaled [--app-text-size:16px]",
  type = "button", onClick, disabled = false, className = "", ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`relative block min-h-11 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${className}`}
      {...rest}
    >
      <PublicAsset src={src} alt="" className="pointer-events-none block h-full min-h-11 w-full select-none object-fill" />

      {visibleLabel && (
        <span className={`pointer-events-none absolute inset-0 flex items-center justify-center px-2 text-center font-subheading font-bold text-white ${labelClassName}`}>
          {visibleLabel}
        </span>
      )}
    </button>
  )
}
