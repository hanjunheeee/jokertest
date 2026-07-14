import { forwardRef } from "react";
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets";
import PublicAsset from "@/shared/ui/PublicAsset";

// 뒤로가기 버튼의 가장 기본 부품입니다.
// 위치나 등장 애니메이션은 모르고, 버튼 이미지와 클릭 처리만 담당합니다.
// 사용 위치에 따라 뒤로가기 버튼 크기를 다르게 쓰기 위한 class 모음입니다.
const SIZE_CLASS = {
  page: "w-[clamp(4.75rem,7.5vw,6.75rem)]",
  compact: "w-[clamp(2.35rem,4vw,2.85rem)] shrink-0",
}

// 버튼 이미지에 마우스를 올리거나 누를 때 적용할 크기 변화 효과입니다.
const IMG_SCALE_CLASS = {
  page: "transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]",
  compact: "transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.9]",
}

// 이미지로 만든 공통 뒤로가기 버튼입니다.
// MotionBackButton처럼 애니메이션이 필요한 버튼도 이 기본 버튼을 바탕으로 만듭니다.
// forwardRef를 써서 부모 컴포넌트가 필요할 때 이 button DOM을 직접 가리킬 수 있게 합니다.
const BackButton = forwardRef(function BackButton(
  { onClick, size = "page", className = "", ariaLabel = "뒤로 가기", style, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      // 이미지 버튼이라 화면 읽기 프로그램이 읽을 버튼 이름을 직접 넣습니다.
      aria-label={ariaLabel}
      onClick={onClick}
      className={`group block cursor-pointer border-0 bg-transparent p-0 leading-none ${SIZE_CLASS[size]} ${className}`}
      // 기본 포커스 outline은 끄고, 호출하는 쪽에서 넘긴 style은 유지합니다.
      style={{ outline: "none", ...style }}
      // 필요한 추가 button 속성들을 그대로 전달합니다.
      {...props}
    >
      {/* public 폴더의 뒤로가기 버튼 이미지를 보여줍니다. */}
      <PublicAsset
        src={NAVIGATION_ASSETS.backButton}
        alt=""
        className={`block h-auto w-full select-none ${IMG_SCALE_CLASS[size]}`}
      />
    </button>
  )
})

export default BackButton
