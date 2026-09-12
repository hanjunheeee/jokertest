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
      // F-16(AC-01): 뒤로가기는 의미상 "취소"다. 표식만 달면 런타임의 document capture 단일
      // 소유자가 이 클릭을 취소음으로 낸다 — 마우스 클릭과 Enter/Space가 만든 click은 같은
      // native Event 하나라 두 번 울리지 않는다. 호출부가 다른 의미를 주고 싶으면 아래
      // {...props}로 덮어쓸 수 있다.
      data-sfx-kind="ui-cancel"
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
