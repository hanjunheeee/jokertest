import PublicAsset from "@/shared/ui/PublicAsset";

// 인증 화면에서 쓰는 이미지 버튼의 공통 이미지 스타일입니다.
// 마우스를 올리거나 누를 때 살짝 커지고 작아지는 효과가 들어 있습니다.
const AUTH_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.05] group-active:scale-[0.95]"

// 이미지 하나로 된 버튼을 만들 때 사용하는 공통 컴포넌트입니다.
// disabled와 visibleLabel은 선택 props입니다 — 기존 호출부(로그인/회원가입 제출 버튼 등)는
// 값을 넘기지 않으므로 이전과 똑같이(활성 상태, 글자 없는 이미지 그대로) 동작합니다.
export default function AuthImageButton({ src, label, className = "", type = "button", onClick, disabled = false, visibleLabel }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      // 이미지에는 글자가 없으므로, 화면 읽기 프로그램이 읽을 버튼 이름을 따로 넣어줍니다.
      aria-label={label}
      className={`group relative block w-full cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {/* public 이미지 경로를 안전한 URL로 바꿔서 버튼 이미지로 보여줍니다. */}
      <PublicAsset src={src} alt="" className={AUTH_BTN_IMG_CLASS} />

      {/* visibleLabel이 있을 때만 이미지 위에 실제 텍스트를 겹쳐 보여줍니다(글자 없는 공용
          버튼 이미지를 여러 문구로 재사용할 때 씁니다). */}
      {visibleLabel && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-sm font-bold text-white">
          {visibleLabel}
        </span>
      )}
    </button>
  )
}
