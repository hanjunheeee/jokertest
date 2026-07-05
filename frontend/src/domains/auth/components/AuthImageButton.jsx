/**
 * 로그인·회원가입용 이미지 버튼 — PNG 한 장을 클릭 가능한 버튼으로 렌더
 * LoginPage(로그인·소셜), SignupForm(회원가입 제출)에서 사용
 *
 * props
 * - src: 버튼 이미지 경로 (loginAssets.js)
 * - label: aria-label·접근성용 (화면에 텍스트 없음)
 * - type: "button" | "submit" (기본 button)
 * - onClick: 클릭 핸들러 (소셜 로그인 등 — 미연동 시 생략)
 * - className: 루트 button 추가 클래스
 */
import PublicAsset from "@/shared/ui/PublicAsset"

const AUTH_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.05] group-active:scale-[0.95]"

/** group 호버 시 이미지만 확대되는 인증 화면 이미지 버튼 */
export default function AuthImageButton({
  src, // 버튼에 그릴 이미지 경로 (loginAssets.js)
  label, // 스크린리더용 텍스트 — 화면엔 텍스트가 없어 aria-label로만 노출
  className = "", // 루트 button에 덧붙일 추가 클래스
  type = "button", // "submit"이면 감싸는 form 제출, 기본은 일반 버튼
  onClick, // 클릭 시 실행할 콜백 — 소셜 로그인 등 아직 연결 안 된 버튼은 생략 가능
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      className={`group block w-full cursor-pointer border-0 bg-transparent p-0 leading-none ${className}`}
    >
      <PublicAsset src={src} alt="" className={AUTH_BTN_IMG_CLASS} />
    </button>
  )
}
