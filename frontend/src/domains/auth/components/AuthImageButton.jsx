import PublicAsset from "@/shared/ui/PublicAsset";

// 인증 화면에서 쓰는 이미지 버튼의 공통 이미지 스타일입니다.
const AUTH_BTN_IMG_CLASS = "block h-auto w-full select-none"

// hover scale은 img가 아니라 버튼에 적용한다 — 프레임 안 overflow-hidden 영역에서
// 이미지만 키우면 양옆이 잘려 보인다. w-[92%]로 기본 폭을 줄여 확대 여유를 둔다.
const AUTH_BTN_INTERACTION_CLASS =
  "transition-transform duration-200 ease-out hover:scale-[1.05] active:scale-[0.95] disabled:hover:scale-100 disabled:active:scale-100"

const VISIBLE_LABEL_ALIGN_CLASS = {
  left: "justify-start text-left pl-[14%]",
  center: "justify-center text-center",
  right: "justify-end text-right pr-[14%]",
}

// 이미지 하나로 된 버튼을 만들 때 사용하는 공통 컴포넌트입니다.
// disabled와 visibleLabel은 선택 props입니다 — 기존 호출부(로그인/회원가입 제출 버튼 등)는
// 값을 넘기지 않으므로 이전과 똑같이(활성 상태, 글자 없는 이미지 그대로) 동작합니다.
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
  interactionClassName = AUTH_BTN_INTERACTION_CLASS,
  ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      // 이미지에는 글자가 없으므로, 화면 읽기 프로그램이 읽을 버튼 이름을 따로 넣어줍니다.
      aria-label={label}
      className={`relative border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-60 ${interactionClassName} ${
        inline ? "inline-block w-auto shrink-0 cursor-pointer" : "mx-auto block w-[92%] cursor-pointer"
      } ${className}`}
      {...rest}
    >
      {/* public 이미지 경로를 안전한 URL로 바꿔서 버튼 이미지로 보여줍니다. */}
      <PublicAsset src={src} alt="" className={AUTH_BTN_IMG_CLASS} />

      {/* visibleLabel이 있을 때만 이미지 위에 실제 텍스트를 겹쳐 보여줍니다(글자 없는 공용
          버튼 이미지를 여러 문구로 재사용할 때 씁니다). */}
      {visibleLabel && (
        <span className={`pointer-events-none absolute inset-0 flex items-center font-subheading font-bold text-white ${VISIBLE_LABEL_ALIGN_CLASS[visibleLabelAlign] ?? VISIBLE_LABEL_ALIGN_CLASS.center} ${visibleLabelClassName}`}>
          {visibleLabel}
        </span>
      )}
    </button>
  )
}
