/**
 * 뒤로가기 이미지 버튼 — 게임·설정·로비 등 페이지 좌하단 공통
 *
 * props
 * - onClick: 뒤로가기 동작 (보통 navigate)
 * - size: "page"(큰) | "compact"(작은, 패널 내)
 * - ariaLabel: 접근성 (기본 "뒤로 가기")
 * - className, style: 버튼 추가 스타일
 * - ref: forwardRef 지원
 *
 * 에셋은 constants/navigationAssets.js
 */
import { forwardRef } from "react"
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const SIZE_CLASS = {
  page: "w-[clamp(4.75rem,7.5vw,6.75rem)]",
  compact: "w-[clamp(2.35rem,4vw,2.85rem)] shrink-0",
}

const IMG_SCALE_CLASS = {
  page: "transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]",
  compact:
    "transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.9]",
}

/** navigationAssets 뒤로가기 PNG 버튼 */
const BackButton = forwardRef(function BackButton(
  {
    onClick, // 버튼 클릭 시 실행할 콜백 (보통 navigate로 이전 화면 이동)
    size = "page", // 버튼 크기 종류: "page"(기본, 큰 버튼) | "compact"(작은 버튼)
    className = "", // 버튼에 추가로 덧붙일 클래스
    ariaLabel = "뒤로 가기", // 스크린리더가 읽어줄 버튼 설명
    style, // 버튼에 추가로 덧붙일 인라인 스타일
    ...props // 그 외 나머지 button 속성은 그대로 전달
  },
  ref, // forwardRef로 전달받은 ref — 부모가 이 버튼의 DOM 요소를 직접 참조할 수 있게 함
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`group block cursor-pointer border-0 bg-transparent p-0 leading-none ${SIZE_CLASS[size]} ${className}`}
      style={{ outline: "none", ...style }}
      {...props}
    >
      <PublicAsset
        src={NAVIGATION_ASSETS.backButton}
        alt=""
        className={`block h-auto w-full select-none ${IMG_SCALE_CLASS[size]}`}
      />
    </button>
  )
})

export default BackButton
