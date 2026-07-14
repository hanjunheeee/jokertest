import PublicAsset from "@/shared/ui/PublicAsset";

// 인증 화면에서 쓰는 이미지 버튼의 공통 이미지 스타일입니다.
// 마우스를 올리거나 누를 때 살짝 커지고 작아지는 효과가 들어 있습니다.
const AUTH_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.05] group-active:scale-[0.95]"

// 이미지 하나로 된 버튼을 만들 때 사용하는 공통 컴포넌트입니다.
export default function AuthImageButton({ src, label, className = "", type = "button", onClick }) {
  return (
    <button
      type={type}
      onClick={onClick}
      // 이미지에는 글자가 없으므로, 화면 읽기 프로그램이 읽을 버튼 이름을 따로 넣어줍니다.
      aria-label={label}
      className={`group block w-full cursor-pointer border-0 bg-transparent p-0 leading-none ${className}`}
    >
      {/* public 이미지 경로를 안전한 URL로 바꿔서 버튼 이미지로 보여줍니다. */}
      <PublicAsset src={src} alt="" className={AUTH_BTN_IMG_CLASS} />
    </button>
  )
}
