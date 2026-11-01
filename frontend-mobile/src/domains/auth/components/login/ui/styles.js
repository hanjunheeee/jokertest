// 인증 화면 모바일 class 모음 (글자 링크·안내 문구·머리글)
// login·signup·social 폼 컴포넌트가 씀, 데스크톱 index.css의 auth-text-link를 모바일 class로 옮김

// 글자 링크: 손가락으로 누르기 쉽게 높이 44px
export const LINK_CLASS =
  "inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent px-1 font-subheading font-bold text-amber-800 underline-offset-2 hover:underline app-text-scaled [--app-text-size:14px] [-webkit-text-stroke:0.35px_currentColor] [paint-order:stroke_fill]"

// 액자 머리글 한 줄
export const HEADER_TEXT_CLASS =
  "text-center font-subheading font-bold leading-snug text-text-body/90 app-text-scaled [--app-text-size:14px]"

// 가입 전 안내 문구
export const HINT_TEXT_CLASS =
  "px-2 text-center font-subheading leading-snug text-black app-text-scaled [--app-text-size:13px]"

// 에러 한 줄 (빨강)
export const ERROR_TEXT_CLASS =
  "px-2 text-center font-subheading font-bold leading-snug text-red-800 app-text-scaled [--app-text-size:13px]"
