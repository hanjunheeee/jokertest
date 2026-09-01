import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

// 친구 목록 패널이 열리고 닫힐 때 쓰는 애니메이션 설정입니다.
export const FRIEND_PANEL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

// 패널 바깥 영역을 덮어서 클릭하면 닫히게 하는 배경 버튼 스타일입니다.
export const FRIEND_PANEL_BACKDROP_CLASS = "absolute inset-0 z-20 cursor-default border-0 bg-black/25 p-0"

// 친구 목록 패널 위치와 크기 스타일입니다.
export const FRIEND_PANEL_CLASS =
  "absolute right-0 top-[2.5%] bottom-[clamp(7.5rem,13vh,10.5rem)] z-30 w-[clamp(17.5rem,22.5vw,25.5rem)] max-w-[26rem] sm:bottom-[clamp(8rem,14vh,11rem)]"

// 패널 프레임 이미지 스타일입니다.
export const FRIEND_PANEL_FRAME_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

// 패널 프레임 안쪽 실제 콘텐츠 영역 스타일입니다.
export const FRIEND_PANEL_CONTENT_CLASS = "relative flex h-full min-h-0 flex-col"

// 패널 프레임 이미지 안쪽 여백입니다.
export const FRIEND_PANEL_INSET_STYLE = {
  paddingTop: "clamp(4rem, 17%, 5.3rem)",
  paddingBottom: "clamp(2.75rem, 11%, 3.5rem)",
  paddingLeft: "10.5%",
  paddingRight: "10.5%",
}

// 친구 검색 영역 전체를 감싸는 박스 스타일입니다.
export const FRIEND_SEARCH_ZONE_CLASS =
  "mb-4 shrink-0 rounded-md border border-white/20 bg-black/40 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_2px_10px_rgba(0,0,0,0.35)]"

// "친구 검색" 같은 검색 영역 제목 스타일입니다.
export const FRIEND_SEARCH_LABEL_CLASS =
  "mb-1.5 font-subheading text-[14px] font-bold tracking-wide text-[#ebe2cc]"

// 검색 입력창 배경 이미지 스타일입니다.
export const FRIEND_SEARCH_INPUT_FRAME_CLASS = "block h-auto w-full select-none"

// 배경 이미지 위에 겹쳐지는 실제 input 스타일입니다.
export const FRIEND_SEARCH_INPUT_CLASS =
  "absolute inset-0 bg-transparent pl-[17%] pr-[6%] font-subheading text-[12px] leading-none text-white/85 outline-none placeholder:text-white/65"

// 친구 목록 탭 버튼들을 가로로 배치하는 영역 스타일입니다.
export const FRIEND_VIEW_TAB_LIST_CLASS =
  "mb-3 flex shrink-0 items-stretch gap-[clamp(0.25rem,0.55vw,0.4rem)]"

// 탭 하나의 버튼 스타일입니다.
export const FRIEND_VIEW_TAB_BUTTON_CLASS =
  "interactive-scale relative flex-1 overflow-hidden border-0 bg-transparent p-0 leading-none"

// 탭 버튼에 깔리는 이미지 스타일입니다.
export const FRIEND_VIEW_TAB_IMAGE_CLASS =
  "block h-[clamp(1.48rem,2.15vw,1.78rem)] w-full select-none object-fill object-center"

// 탭 버튼 이미지 위에 올라가는 글자 스타일입니다.
export const FRIEND_VIEW_TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.68rem,0.95vw,0.82rem)] font-bold tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 접고 펼칠 수 있는 친구 그룹 전체 박스 스타일입니다.
export const FRIEND_FOLDER_SECTION_CLASS =
  "relative shrink-0 overflow-hidden rounded-md border border-white/25 px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.45)] backdrop-blur-sm"

// 그룹 박스 뒤에 깔리는 어두운 배경 스타일입니다.
export const FRIEND_FOLDER_BACKDROP_CLASS = "pointer-events-none absolute inset-0 bg-black/65"

// 실제 내용이 어두운 배경 위로 올라오게 하는 래퍼 스타일입니다.
export const FRIEND_FOLDER_CONTENT_CLASS = "relative z-10"

// 폴더 헤더 버튼 스타일입니다.
export const FRIEND_FOLDER_HEADER_CLASS =
  "mt-0 flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 [&_img]:opacity-100 [&_span]:font-bold [&_span]:text-white"

// 폴더 열림/닫힘 아이콘 스타일입니다.
export const FRIEND_FOLDER_ICON_CLASS = "h-4 w-4 shrink-0 select-none"

// 폴더 제목 텍스트 스타일입니다.
export const FRIEND_FOLDER_LABEL_CLASS = "font-subheading text-[13px] text-white/90"

// 폴더 오른쪽 화살표 아이콘 스타일입니다.
export const FRIEND_FOLDER_CHEVRON_CLASS = "ml-auto h-3 w-3 shrink-0 select-none opacity-90"

// 친구 row 목록 기본 스타일입니다.
export const FRIEND_FOLDER_LIST_CLASS = "mt-1.5 overflow-visible pr-0.5"

// 친구 한 명을 감싸는 li 스타일입니다.
export const FRIEND_ROW_ITEM_CLASS = "relative mt-2 w-full list-none"

// 찢어진 비단 프레임 이미지 스타일입니다.
export const FRIEND_ROW_FRAME_CLASS = "block h-auto w-full select-none"

// 프레임 이미지 위에 친구 정보를 올리는 영역 스타일입니다.
export const FRIEND_ROW_CONTENT_CLASS = "absolute inset-0 flex items-center gap-1.5 px-[6%] py-[6%]"

// 즐겨찾기 빈 별 버튼 스타일입니다.
export const FRIEND_ROW_FAVORITE_BUTTON_CLASS =
  "relative z-[2] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

export const FRIEND_ROW_FAVORITE_STAR_CLASS =
  "block size-[clamp(1.05rem,1.45vw,1.25rem)] select-none text-[#a89262]/45"

export const FRIEND_ROW_FAVORITE_STAR_ACTIVE_CLASS =
  "block size-[clamp(1.05rem,1.45vw,1.25rem)] select-none text-[#e8c56a]"

// 친구 목록 row의 프로필 초상 크기 스타일입니다.
export const FRIEND_ROW_PROFILE_PORTRAIT_WRAP_CLASS =
  "relative z-[2] size-[3.6rem] shrink-0 select-none"

// 친구 추가·요청 수락 row의 프로필 초상 크기 스타일입니다.
export const FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS =
  "relative z-[2] size-[3.6rem] shrink-0 select-none"

// 친구 이름이 길 때 말줄임이 되도록 잡는 정보 영역 스타일입니다.
export const FRIEND_ROW_INFO_CLASS = "min-w-0 flex-1"

// 친구 이름 텍스트 스타일입니다.
export const FRIEND_ROW_NAME_CLASS =
  "truncate font-subheading text-[clamp(0.8rem,1.05vw,0.95rem)] leading-tight text-white"

// 접속 상태 아이콘과 글자를 나란히 두는 영역 스타일입니다.
export const FRIEND_ROW_STATUS_WRAP_CLASS = "mt-1 flex items-center gap-1.5"

// 접속 상태 배지 이미지를 감싸는 크기 스타일입니다.
export const FRIEND_ROW_STATUS_BADGE_CLASS = "relative inline-flex h-[1.15rem] w-[1.15rem] shrink-0"

// 오프라인일 때 배지 위에 어둡게 덮는 스타일입니다.
export const FRIEND_ROW_OFFLINE_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 rounded-full bg-black/80"

// 접속 상태 글자의 공통 스타일입니다.
export const FRIEND_ROW_STATUS_TEXT_CLASS = "text-[10px] leading-none"

// 친구 목록 기본 탭 전체 레이아웃 스타일입니다.
export const FRIEND_LIST_TAB_CLASS = "flex h-full min-h-0 flex-col"

// 기본 탭 로컬 검색 결과 목록 스타일입니다.
export const FRIEND_LIST_FILTER_RESULT_LIST_CLASS =
  `mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

// 기본 탭 로컬 검색 결과가 없을 때 문구 스타일입니다.
export const FRIEND_LIST_FILTER_EMPTY_CLASS = "mt-6 text-center text-[11px] text-white/50"

// 친구 그룹 안의 row 목록이 너무 길어질 때 스크롤되게 하는 스타일입니다.
export const FRIEND_TAB_SCROLLABLE_LIST_CLASS =
  `mt-1 max-h-[12rem] overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

// 첫 그룹 아래부터 그룹 사이에 간격을 주는 스타일입니다.
export const FRIEND_TAB_GROUP_GAP_CLASS = "mt-3.5"

// 친구 신청 탭 전체 레이아웃 스타일입니다.
export const FRIEND_REQUEST_TAB_CLASS = "relative flex min-h-0 flex-1 flex-col"

// 친구 검색 결과 목록 스타일입니다.
export const FRIEND_REQUEST_RESULT_LIST_CLASS =
  `mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[clamp(2.6rem,4.2vw,3.1rem)] pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

// 검색 결과가 없거나 검색 전일 때 보여주는 문구 스타일입니다.
export const FRIEND_REQUEST_EMPTY_CLASS = "mt-10 text-center text-[11px] text-white/50"

// 친구 신청 탭 좌측 하단 고정 뒤로가기 버튼 스타일입니다.
export const FRIEND_REQUEST_BACK_BUTTON_CLASS = "absolute bottom-0 left-0 z-10"

// 친구 요청 수락 탭 전체 레이아웃 스타일입니다.
export const FRIEND_ACCEPT_TAB_CLASS = "flex h-full min-h-0 flex-col"

// 전부 수락/새로고침 버튼이 들어가는 상단 도구 영역 스타일입니다.
export const FRIEND_ACCEPT_TOOLBAR_CLASS =
  "relative mt-3 flex w-full shrink-0 items-center justify-end gap-[clamp(0.3rem,0.55vw,0.45rem)] pr-[clamp(0.65rem,3.5%,1rem)]"

// "전부 수락" 이미지 버튼 스타일입니다.
export const FRIEND_ACCEPT_ALL_BUTTON_CLASS =
  "relative w-[clamp(4.75rem,38%,6.1rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

// "전부 수락" 버튼 안 글자 스타일입니다.
export const FRIEND_ACCEPT_ALL_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.62rem,0.9vw,0.76rem)] font-bold tracking-wide text-[#e8f0dc] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

// 새로고침 이미지 버튼 스타일입니다.
export const FRIEND_ACCEPT_REFRESH_BUTTON_CLASS =
  "w-[clamp(1.45rem,2.1vw,1.7rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

// 버튼 안 이미지 공통 스타일입니다.
export const FRIEND_ACCEPT_BUTTON_IMAGE_CLASS = "block h-auto w-full select-none"

// 받은 친구 요청 목록 스타일입니다.
export const FRIEND_ACCEPT_LIST_CLASS =
  `mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

// 받은 요청이 없을 때 보여줄 문구 스타일입니다.
export const FRIEND_ACCEPT_EMPTY_CLASS = "mt-10 text-center text-[11px] text-white/50"

// 수락 탭 아래쪽 뒤로가기 버튼 여백입니다.
export const FRIEND_ACCEPT_BACK_BUTTON_CLASS = "mt-2"

// 받은 친구 요청 row의 액션 버튼 영역 스타일입니다.
export const INCOMING_FRIEND_ACTIONS_CLASS =
  "flex shrink-0 items-center gap-[clamp(0.2rem,0.45vw,0.35rem)]"

// 받은 친구 요청 row의 수락/거절 버튼 스타일입니다.
export const INCOMING_FRIEND_ACTION_BUTTON_CLASS =
  "block w-[clamp(1.85rem,2.8vw,2.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

// 추천 친구 한 명을 감싸는 li 스타일입니다.
export const RECOMMENDED_FRIEND_ROW_CLASS = "relative mt-2 w-full list-none"

// 추천 친구 row의 배경 프레임 이미지 스타일입니다.
export const RECOMMENDED_FRIEND_ROW_FRAME_CLASS = "block h-auto w-full select-none"

// 프레임 위에 추천 친구 정보와 버튼을 배치하는 영역 스타일입니다.
export const RECOMMENDED_FRIEND_ROW_CONTENT_CLASS =
  "absolute inset-0 flex items-center justify-between gap-1 px-[6%] py-[6%]"

// 프로필과 이름/상태를 묶는 왼쪽 영역 스타일입니다.
export const RECOMMENDED_FRIEND_INFO_WRAP_CLASS =
  "flex min-w-0 max-w-[58%] items-center gap-2"

// 친구 이름과 접속 상태를 담는 텍스트 영역 스타일입니다.
export const RECOMMENDED_FRIEND_TEXT_WRAP_CLASS = "min-w-0"

// 추천 친구 이름 텍스트 스타일입니다.
export const RECOMMENDED_FRIEND_NAME_CLASS =
  "truncate font-subheading text-[clamp(0.78rem,1vw,0.92rem)] leading-tight text-white"

// 추천 친구 접속 상태 영역 스타일입니다.
export const RECOMMENDED_FRIEND_STATUS_WRAP_CLASS = "mt-0.5 flex items-center gap-1.5"

// 추천 친구 접속 상태 배지 스타일입니다.
export const RECOMMENDED_FRIEND_STATUS_BADGE_CLASS = "relative inline-flex h-[1.05rem] w-[1.05rem] shrink-0"

// 오프라인일 때 배지 위를 어둡게 덮는 스타일입니다.
export const RECOMMENDED_FRIEND_OFFLINE_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 rounded-full bg-black/80"

// 접속 상태 글자의 공통 스타일입니다.
export const RECOMMENDED_FRIEND_STATUS_TEXT_CLASS = "text-[9px] leading-none"

// 차단/친구 신청 버튼들을 묶는 오른쪽 영역 스타일입니다.
export const RECOMMENDED_FRIEND_ACTIONS_CLASS =
  "relative z-[2] flex shrink-0 items-center gap-[clamp(0.25rem,0.55vw,0.45rem)]"

// 추천 친구 row의 작은 액션 버튼 스타일입니다.
export const RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS =
  "block w-[clamp(2.25rem,3.45vw,2.85rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

// 이미 신청한 버튼에 붙는 비활성 느낌의 스타일입니다.
export const RECOMMENDED_FRIEND_SENT_BUTTON_CLASS = "opacity-40 cursor-default"

// 액션 버튼 안 이미지 스타일입니다.
export const RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS = "block h-auto w-full select-none"
