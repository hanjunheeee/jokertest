// 계정 찾기 카드 안 그림 버튼 (아이디 찾기·재설정 링크 보내기·비밀번호 변경), 데스크톱 AuthImageButton 자리
// recovery 폼 3개가 씀
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"

// 데스크톱처럼 카드 폭 92%·그림 비율대로 높이, 잠기면 흐리게
const LOOK = {
  button:
    "relative mx-auto mt-2 block min-h-11 w-[92%] cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform duration-200 ease-out active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
  img: "pointer-events-none block h-auto w-full select-none",
  label: "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading font-bold text-white",
}

// 글자 크기: 데스크톱 아이디 찾기는 16px, 나머지는 text-sm
const LABEL_SIZE = {
  large: "app-text-scaled [--app-text-size:16px]",
  small: "app-text-scaled [--app-text-size:14px]",
}

// 제출 버튼이라 form 안에 둠 (Enter 제출도 같이 됨)
export default function RecoveryButton({ src = "/button/버튼 프레임2.png", label, disabled, labelSize = "small" }) {
  return (
    <ImageButton
      type="submit"
      look={LOOK}
      src={src}
      label={label}
      ariaLabel={label}
      labelClassName={LABEL_SIZE[labelSize] ?? LABEL_SIZE.small}
      disabled={disabled}
    />
  )
}
