// 친구 목록 패널 className·움직임 값 (패널 틀·탭·폴더·줄·탭별 목록)
// 친구 목록 컴포넌트들(components/friendList)이 씀
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

// 패널 열고 닫는 움직임·뒤 배경·틀
export const FRIEND_PANEL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

export const PANEL_BACKDROP_CLASS = "absolute inset-0 z-20 cursor-default border-0 bg-black/25 p-0"

// 1280 창에서 288px이면 친구 줄 이름 칸이 단추에 눌려 0이 되어 가장 좁을 때 20rem
export const FRIEND_PANEL_CLASS =
  "absolute right-0 top-[2.5%] bottom-[clamp(7.5rem,13vh,10.5rem)] z-30 w-[clamp(20rem,25vw,25.5rem)] max-w-[26rem] sm:bottom-[clamp(8rem,14vh,11rem)]"

export const PANEL_FRAME_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

export const PANEL_CONTENT_CLASS = "relative flex h-full min-h-0 flex-col"

export const PANEL_INSET_STYLE = {
  paddingTop: "clamp(4rem, 17%, 5.3rem)",
  paddingBottom: "clamp(2.75rem, 11%, 3.5rem)",
  paddingLeft: "10.5%",
  paddingRight: "10.5%",
}

// 검색 줄
export const SEARCH_ZONE_CLASS =
  "mb-4 shrink-0 rounded-md border border-white/20 bg-black/40 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_2px_10px_rgba(0,0,0,0.35)]"

export const SEARCH_LABEL_CLASS =
  "mb-1.5 font-subheading app-text-scaled [--app-text-size:14px] font-bold tracking-wide text-[#ebe2cc]"

export const SEARCH_INPUT_FRAME_CLASS = "block h-auto w-full select-none"

export const SEARCH_INPUT_CLASS =
  "absolute inset-0 bg-transparent pl-[17%] pr-[6%] font-subheading app-text-scaled [--app-text-size:12px] leading-none text-white/85 outline-none placeholder:text-white/65"

// 위쪽 탭 버튼
export const VIEW_TAB_LIST_CLASS =
  "mb-3 flex shrink-0 items-stretch gap-[clamp(0.25rem,0.55vw,0.4rem)]"

export const VIEW_TAB_BTN_CLASS =
  "interactive-scale relative flex-1 overflow-hidden border-0 bg-transparent p-0 leading-none"

export const VIEW_TAB_IMG_CLASS =
  "block h-[clamp(1.48rem,2.15vw,1.78rem)] w-full select-none object-fill object-center"

export const VIEW_TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.68rem,0.95vw,0.82rem)] font-bold tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 친구 폴더 (바탕·머리·펼친 목록)
export const FOLDER_SECTION_CLASS =
  "relative shrink-0 overflow-hidden rounded-md border border-white/25 px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.45)] backdrop-blur-sm"

export const FOLDER_BACKDROP_CLASS = "pointer-events-none absolute inset-0 bg-black/65"

export const FOLDER_CONTENT_CLASS = "relative z-10"

export const FOLDER_HEADER_CLASS =
  "mt-0 flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 [&_img]:opacity-100 [&_span]:font-bold [&_span]:text-white"

export const FOLDER_ICON_CLASS = "h-4 w-4 shrink-0 select-none"

export const FOLDER_LABEL_CLASS = "font-subheading app-text-scaled [--app-text-size:13px] text-white/90"

export const FOLDER_CHEVRON_CLASS = "ml-auto h-3 w-3 shrink-0 select-none opacity-90"

export const FOLDER_LIST_CLASS = "mt-1.5 overflow-visible pr-0.5"

// 친구 줄 (별·초상·이름·접속 상태)
export const FRIEND_ROW_ITEM_CLASS = "relative mt-2 w-full list-none"

export const FRIEND_ROW_FRAME_CLASS = "block h-auto w-full select-none"

// 줄 그림과 그 위 내용 칸을 묶음 (줄 아래 글이 붙어 줄이 길어져도 내용 칸은 줄 그림 높이만)
export const ROW_FRAME_WRAP_CLASS = "relative"

// 별·초상·이름·단추 다섯이 한 줄이라 사이·옆 여백을 줄여 이름 칸 폭을 남김
export const ROW_CONTENT_CLASS = "absolute inset-0 flex items-center gap-1 px-[4%] py-[6%]"

export const ROW_FAVORITE_BTN_CLASS =
  "relative z-[2] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

export const ROW_FAVORITE_STAR_CLASS =
  "block size-[clamp(1.05rem,1.45vw,1.25rem)] select-none text-[#a89262]/45"

export const ROW_FAVORITE_STAR_ACTIVE_CLASS =
  "block size-[clamp(1.05rem,1.45vw,1.25rem)] select-none text-[#e8c56a]"

// 친구 줄 초상은 좁은 창에서 줄 높이만큼 작게 (이름 칸 폭 남기기), 넓은 창에선 다른 줄과 같은 3.6rem
export const ROW_PROFILE_PORTRAIT_WRAP_CLASS =
  "relative z-[2] size-[clamp(2.5rem,3.1vw,3.6rem)] shrink-0 select-none"

export const PROFILE_PORTRAIT_WRAP_CLASS =
  "relative z-[2] size-[3.6rem] shrink-0 select-none"

// 단추가 늘어도 이름 칸이 0까지 눌리지 않게 최소 폭
export const FRIEND_ROW_INFO_CLASS = "min-w-[3rem] flex-1"

// 친구 줄 오른쪽 단추 칸·단추 (다른 줄보다 작게: 단추 둘에 이름 칸이 눌리던 것)
export const FRIEND_ROW_ACTIONS_CLASS = "relative z-[2] flex shrink-0 items-center gap-1"

export const FRIEND_ROW_ICON_BTN_CLASS =
  "block w-[clamp(1.85rem,2.3vw,2.85rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

// 글자 얹은 판 그림(끊기·확인·취소)은 글자가 들어가게 그림 단추보다 조금 넓게
export const FRIEND_ROW_LABEL_BTN_CLASS =
  "block w-[clamp(2.3rem,2.85vw,2.85rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const FRIEND_ROW_NAME_CLASS =
  "truncate font-subheading app-text-scaled [--app-text-size:clamp(0.8rem,1.05vw,0.95rem)] leading-tight text-white"

export const ROW_STATUS_WRAP_CLASS = "mt-1 flex items-center gap-1.5"

export const ROW_STATUS_BADGE_CLASS = "relative inline-flex h-[1.15rem] w-[1.15rem] shrink-0"

export const ROW_OFFLINE_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 rounded-full bg-black/80"

export const ROW_STATUS_TEXT_CLASS = "app-text-scaled [--app-text-size:10px] leading-none"

// 친구 목록 탭·검색 결과·상태 문구
export const FRIEND_LIST_TAB_CLASS = "flex h-full min-h-0 flex-col"

export const FILTER_RESULT_LIST_CLASS =
  `mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const STATUS_MSG_CLASS = "app-text-scaled [--app-text-size:16px]"

export const STATUS_DETAIL_CLASS = "app-text-scaled [--app-text-size:14px]"

// 줄 아래 한 줄 글(실패·묻는 글·끝난 까닭): 줄 안 좁은 칸에선 글자마다 세로로 쌓여 줄 밖으로 넘쳐 줄 폭 전체로 뺌
// 창 종이·폴더 어디에 와도 읽히게 글 뒤만 어둡게 깖, 위 간격은 줄 밖으로 삐져나온 초상에 안 가리게
const ROW_NOTE_CLASS = `mt-2.5 rounded bg-black/60 px-2 py-1 leading-snug ${STATUS_DETAIL_CLASS}`

export const STATUS_DETAIL_MUTED_CLASS =
  `${ROW_NOTE_CLASS} text-white/80`

// 분홍(red-300)은 종이 위에서 대비 2 안팎이라 어두운 바탕 위 옅은 빨강
export const STATUS_DETAIL_ERROR_CLASS =
  `${ROW_NOTE_CLASS} text-red-200`

export const ROW_NOTE_ASK_CLASS =
  `${ROW_NOTE_CLASS} text-white`

// 줄 없이 창 종이(중간 밝기 갈색) 위에 바로 뜨는 안내·빈 목록 글: 흰 글은 안 보여 검정 (아래 두 개도 같음)
export const FILTER_EMPTY_CLASS =
  `mt-6 text-center ${STATUS_MSG_CLASS} text-black`

export const TAB_SCROLLABLE_LIST_CLASS =
  `mt-1 max-h-[12rem] overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const TAB_GROUP_GAP_CLASS = "mt-3.5"

// 친구 추가 탭
export const REQUEST_TAB_CLASS = "relative flex min-h-0 flex-1 flex-col"

export const REQUEST_RESULT_LIST_CLASS =
  `mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[clamp(2.6rem,4.2vw,3.1rem)] pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const REQUEST_EMPTY_CLASS =
  `mt-10 text-center ${STATUS_MSG_CLASS} text-black`

export const REQUEST_BACK_BTN_CLASS = "absolute bottom-0 left-0 z-10"

// 받은 신청·차단·게임 초대 탭 (같은 틀을 같이 씀)
export const FRIEND_ACCEPT_TAB_CLASS = "flex h-full min-h-0 flex-col"

export const ACCEPT_TOOLBAR_CLASS =
  "relative mt-3 flex w-full shrink-0 items-center justify-end gap-[clamp(0.3rem,0.55vw,0.45rem)] pr-[clamp(0.65rem,3.5%,1rem)]"

export const ACCEPT_ALL_BTN_CLASS =
  "relative w-[clamp(4.75rem,38%,6.1rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const ACCEPT_ALL_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.62rem,0.9vw,0.76rem)] font-bold tracking-wide text-[#e8f0dc] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

export const ACCEPT_REFRESH_BTN_CLASS =
  "group w-[clamp(1.45rem,2.1vw,1.7rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0"

export const ACCEPT_BTN_IMG_CLASS = "block h-auto w-full select-none"

export const ACCEPT_REFRESH_BTN_IMG_CLASS =
  `interactive-scale-sm ${ACCEPT_BTN_IMG_CLASS}`

export const ACCEPT_LIST_CLASS =
  `mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const ACCEPT_EMPTY_CLASS =
  `mt-10 text-center ${STATUS_MSG_CLASS} text-black`

// 종이 위 목록 오류 + 다시 시도: 빨강은 이 종이에서 어떤 짙기로도 안 읽혀 글 뒤만 어둡게 깔고 옅은 빨강
export const STATUS_ERROR_CLASS =
  `rounded bg-black/60 py-1 ${STATUS_MSG_CLASS} text-red-200`

// 종이 위 작은 머리글("보낸 신청 (n)"): 위 안내 글과 같은 검정
export const PAPER_DETAIL_CLASS =
  `${STATUS_DETAIL_CLASS} text-black`

export const ACCEPT_BACK_BTN_CLASS = "mt-2"

// 받은 신청 줄 버튼 칸 (지금 아무도 안 씀)
export const INCOMING_ACTIONS_CLASS =
  "flex shrink-0 items-center gap-[clamp(0.2rem,0.45vw,0.35rem)]"

export const INCOMING_ACTION_BTN_CLASS =
  "block w-[clamp(1.85rem,2.8vw,2.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

// 검색 결과·받은 신청·차단·초대 줄 공통
export const RECOMMENDED_ROW_CLASS = "relative mt-2 w-full list-none"

export const RECOMMENDED_ROW_FRAME_CLASS = "block h-auto w-full select-none"

export const RECOMMENDED_ROW_CONTENT_CLASS =
  "absolute inset-0 flex items-center justify-between gap-1 px-[6%] py-[6%]"

export const RECOMMENDED_INFO_WRAP_CLASS =
  "flex min-w-0 max-w-[58%] items-center gap-2"

export const RECOMMENDED_TEXT_WRAP_CLASS = "min-w-0"

export const RECOMMENDED_NAME_CLASS =
  "truncate font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1vw,0.92rem)] leading-tight text-white"

export const RECOMMENDED_STATUS_WRAP_CLASS = "mt-0.5 flex items-center gap-1.5"

export const RECOMMENDED_STATUS_BADGE_CLASS = "relative inline-flex h-[1.05rem] w-[1.05rem] shrink-0"

export const RECOMMENDED_OFFLINE_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 rounded-full bg-black/80"

export const RECOMMENDED_STATUS_TEXT_CLASS = "app-text-scaled [--app-text-size:9px] leading-none"

export const RECOMMENDED_ACTIONS_CLASS =
  "relative z-[2] flex shrink-0 items-center gap-[clamp(0.25rem,0.55vw,0.45rem)]"

export const RECOMMENDED_ACTION_BTN_CLASS =
  "block w-[clamp(2.25rem,3.45vw,2.85rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const RECOMMENDED_SENT_BTN_CLASS = "opacity-40 cursor-default"

// 글자 없는 버튼 그림 위에 얹는 글자 (받은 신청 줄 "거절"과 같은 모양, 보낸 신청 "취소"·친구 줄 "끊기"가 씀)
export const ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center app-text-scaled [--app-text-size:13px] font-semibold text-[#f5f0e6]"

// 취소·끊기 버튼은 키보드로 옮겨 왔을 때만 테두리를 보임 (확인·취소 중 어디에 있는지 보여야 해서, 문의 창 버튼과 같은 색)
export const ACTION_BTN_FOCUS_CLASS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"

export const RECOMMENDED_ACTION_IMG_CLASS = "block h-auto w-full select-none"
