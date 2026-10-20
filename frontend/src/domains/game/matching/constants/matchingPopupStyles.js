/**
 * @file matchingPopupStyles.js
 * @desc 매칭 대기 화면(GameMatchingPage) 팝업 UI에서 쓰는 Tailwind 클래스 문자열 상수 모음.
 * 컴포넌트에서 className을 길게 나열하는 대신 이 상수를 import해서 재사용합니다.
 */

/** 매칭 팝업 — 이미지+텍스트 라벨 버튼 (group 내 wrapper에 적용, 프레임·텍스트 함께 확대) */
export const MATCHING_BTN_SCALE_WRAP_CLASS =
  "relative block w-full transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]"

/** 매칭 팝업 — 이미지만 있는 버튼 (닫기 등) */
export const MATCHING_BTN_IMG_SCALE_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]"

/** 매칭 팝업 버튼 포커스 표시 — 마우스 클릭 시엔 안 보이고 키보드(Tab) 포커스일 때만
 * 테마 톤(#f5f0e6)의 outline을 보여준다. outline: none만 남겨 포커스 표시를 완전히
 * 지우지 않기 위한 공용 클래스. */
export const MATCHING_BTN_FOCUS_CLASS =
  "outline-none rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5f0e6]"

/** 매칭 팝업 프레임 위 — 방코드 보기 (작은 버튼) */
export const MATCHING_ROOM_CODE_BTN_WRAP_CLASS =
  `group absolute right-[clamp(0%,0.2vw,0.75%)] top-[clamp(0.1rem,0.65vh,0.45rem)] z-[4] block w-[clamp(7.25rem,10.5vw,8.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none ${MATCHING_BTN_FOCUS_CLASS}`

/** 매칭 팝업 하단 — 게임시작·방 삭제 버튼 영역 (프레임 inset 위) */
export const MATCHING_START_GAME_BTN_AREA_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex flex-col items-center justify-end pb-[clamp(4.5rem,10.5%,4.5rem)]"

/** 게임시작·방 삭제 버튼 가로 배치 행 — 좁은 화면에서 버튼(방장 3개)이 다 안 들어가면
 * 다음 줄로 줄바꿈한다(flex-wrap). 줄바꿈된 두 번째 줄도 가운데 정렬 유지. */
export const MATCHING_ACTION_BTN_ROW_CLASS =
  "pointer-events-auto mx-auto flex w-full max-w-[min(92%,36rem)] flex-wrap items-center justify-center gap-x-[clamp(0.55rem,1.15vw,0.85rem)] gap-y-[clamp(0.4rem,1vh,0.6rem)]"

/** 게임시작·방 삭제 이미지 버튼 공통 */
export const MATCHING_ACTION_BTN_CLASS =
  `group w-[clamp(8.5rem,18vw,11.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none ${MATCHING_BTN_FOCUS_CLASS}`

/** 게임시작·방 삭제 버튼 이미지 위 텍스트 라벨 */
export const MATCHING_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:clamp(0.88rem,1.25vw,1.05rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

/** 방코드 보기 버튼 이미지 위 텍스트 라벨 */
export const MATCHING_ROOM_CODE_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.1vw,0.95rem)] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 방장 전용 — 좌측 상단 설정·추방 버튼 행 (가로 1줄, 줄바꿈 없음) */
export const MATCHING_HOST_ACTION_COL_CLASS =
  "absolute top-[2.5%] left-[2.5%] z-30 flex flex-row flex-nowrap items-center gap-x-[clamp(0.3rem,0.55vw,0.45rem)] sm:top-[3%] sm:left-[3%]"

/** 방장 전용 — 이미지+텍스트 라벨 버튼 (컴팩트 폭, 라벨 한 줄 고정) */
export const MATCHING_HOST_ACTION_BTN_CLASS =
  `group w-[clamp(6.5rem,10.5vw,7.75rem)] shrink-0 flex-none cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-50 ${MATCHING_BTN_FOCUS_CLASS}`

/** 방장 전용 버튼 이미지 위 텍스트 라벨 */
export const MATCHING_HOST_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-[4%] font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.05vw,0.88rem)] font-bold leading-none tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

/** 매칭 팝업 프레임 상단 제목 ("멀티 플레이 매칭") */
export const MATCHING_TITLE_CLASS =
  "pointer-events-none absolute left-1/2 top-[5.85%] z-[2] w-[72%] -translate-x-1/2 text-center font-display app-text-scaled [--app-text-size:clamp(2rem,3.15vw,2.75rem)] font-medium leading-none tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_1px_1px_rgba(0,0,0,0.45)]"

/** 팝업 본문 안내 문구 (prompt) */
export const MATCHING_PROMPT_CLASS =
  "text-center font-subheading app-text-scaled [--app-text-size:clamp(1.38rem,1.92vw,1.58rem)] font-bold leading-snug text-[#1a1008]"

/** 파티 슬롯 2행 그리드 wrapper — MatchingPartySlots (타이머 UI 제거분만큼 하단 여백을 상단으로 이동) */
export const MATCHING_SLOTS_GRID_CLASS =
  "mt-[clamp(3.75rem,7.8vh,5.75rem)] flex min-h-[clamp(6.65rem,13.5vh,9.35rem)] shrink-0 flex-col items-center justify-center gap-[clamp(0.42rem,0.88vh,0.68rem)]"

/** 슬롯 한 행 (최대 5명) */
export const MATCHING_SLOTS_ROW_CLASS =
  "flex items-end justify-center gap-[clamp(0.42rem,1vw,0.82rem)]"

/** 5명 이하일 때 슬롯 실루엣 크기 */
export const MATCHING_SLOT_CLASS_LARGE =
  "block h-auto w-[clamp(5.35rem,9.4vw,7.35rem)] max-w-full shrink-0 select-none object-contain"

/** 6~10명일 때 슬롯 실루엣 크기 (2행·컴팩트) */
export const MATCHING_SLOT_CLASS_COMPACT =
  "block h-auto w-[clamp(4.25rem,7.2vw,5.75rem)] max-w-full shrink-0 select-none object-contain"

/** 미준비 실루엣만 — 준비 실루엣과 하단 정렬 맞춤 */
export const MATCHING_SLOT_NOT_READY_OFFSET_CLASS =
  "-translate-y-[clamp(0.42rem,2.1vh,0.75rem)]"

/** 슬롯 실루엣 wrapper */
export const MATCHING_SLOT_WRAP_CLASS =
  "flex flex-col items-center"

/** 결과 화면 → 매칭 대기 안내 문구 */
export const MATCHING_WAITING_MESSAGE_CLASS =
  "mt-[clamp(0.58rem,1.2vh,0.92rem)] shrink-0 text-center font-subheading app-text-scaled [--app-text-size:clamp(1.08rem,1.42vw,1.22rem)] font-bold text-[#1a1008]"

/** GameMatchingPage 우상단 파티 인원 헤더 wrapper */
export const MATCHING_PARTY_HEADER_CLASS =
  "absolute top-[2.5%] right-[2.5%] z-20 flex items-center gap-[clamp(0.5rem,0.95vw,0.72rem)] sm:top-[3%] sm:right-[3%]"

/** "파티 인원 N명" 텍스트 (숫자 제외) */
export const MATCHING_PARTY_TEXT_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(1.28rem,1.72vw,1.5rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

/** 파티 인원 숫자만 — 신라문화체 + 골드 톤 강조 */
export const MATCHING_PARTY_COUNT_CLASS =
  "font-display app-text-scaled [--app-text-size:clamp(1.55rem,2.1vw,1.82rem)] font-medium leading-none text-text-main tabular-nums antialiased"

/** 파티 헤더 미준비 실루엣 아이콘 */
export const MATCHING_PARTY_ICON_CLASS =
  "block h-[clamp(1.9rem,2.65vw,2.35rem)] w-auto shrink-0 select-none object-contain opacity-95"

/** 방코드 모달 — 팝업 닫기 */
export const MATCHING_MODAL_CLOSE_BTN_CLASS =
  "group absolute right-[clamp(-0.4rem,-1%,-0.15rem)] top-[clamp(0.95rem,4.2%,1.65rem)] z-20 block w-[clamp(3.75rem,7.4vw,5.1rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"
