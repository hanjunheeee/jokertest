// 마이페이지 배너 안의 글자가 배경 이미지 위에서도 읽히도록 주는 그림자입니다.
export const MY_PAGE_BANNER_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.45)"

// 배너 이미지 안에서 텍스트가 시작되는 기준 위치입니다.
// 선과 텍스트 시작점을 같은 기준으로 맞추기 위해 따로 뺐습니다.
export const MY_PAGE_BANNER_TEXT_INSET_LEFT = "-4%"

// Tailwind arbitrary class는 문자열 조합에서 재사용하기 위해 상수로 둡니다.
// 일반 style의 left 값이 아니라 className 안에 들어가는 위치 클래스입니다.
export const MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS = "left-[-4%]"

// 프로필 문구, 명성, 칭호에 각각 들어가는 글자 스타일입니다.
// cqi는 배너 박스 너비를 기준으로 글자 크기를 맞추는 단위입니다.
export const MY_PAGE_BANNER_LABEL_TEXT_CLASS = "font-subheading text-[4.4cqi] font-bold leading-tight text-[#ebe2cc]"
export const MY_PAGE_BANNER_REPUTATION_TEXT_CLASS = "font-subheading text-[4cqi] font-bold leading-tight text-[#e5dcc4]"
export const MY_PAGE_BANNER_TITLE_TEXT_CLASS = "font-subheading text-[3.5cqi] font-bold leading-tight text-[#d8cdb8]"

// 배너 전체의 기준 박스입니다. cqi 단위를 쓰기 위해 container-type을 켭니다.
// 이 class가 있어야 text-[4cqi] 같은 글자 크기가 배너 너비 기준으로 계산됩니다.
export const MY_PAGE_BANNER_ROOT_CLASS = "relative block [container-type:inline-size] leading-none"

// 설정 톱니 버튼과 그 안의 이미지에 들어가는 공통 스타일입니다.
// 버튼 위치 값은 myPageBannerLayout.js에 있고, 여기에는 반복되는 class만 둡니다.
export const MY_PAGE_BANNER_SETTINGS_BTN_CLASS = "group absolute z-10 cursor-pointer border-0 bg-transparent p-0 leading-none"
export const MY_PAGE_BANNER_SETTINGS_GEAR_IMG_CLASS = "interactive-scale-sm block h-full w-full select-none object-contain"
