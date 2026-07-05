/** 매칭 팝업 — 이미지+텍스트 라벨 버튼 (group 내 wrapper에 적용, 프레임·텍스트 함께 확대) */
export const MATCHING_BTN_SCALE_WRAP_CLASS =
  "relative block w-full transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]"

/** 매칭 팝업 — 이미지만 있는 버튼 (닫기 등) */
export const MATCHING_BTN_IMG_SCALE_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]"

/** 매칭 팝업 프레임 위 — 방코드 보기 (작은 버튼) */
export const MATCHING_ROOM_CODE_BTN_WRAP_CLASS =
  "group absolute right-[clamp(0%,0.2vw,0.75%)] top-[clamp(0.1rem,0.65vh,0.45rem)] z-[4] block w-[clamp(7.25rem,10.5vw,8.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

/** 매칭 팝업 하단 — 게임시작·방 삭제 버튼 영역 (프레임 inset 위) */
export const MATCHING_START_GAME_BTN_AREA_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex flex-col items-center justify-end pb-[clamp(4.5rem,10.5%,4.5rem)]"

/** 게임시작·방 삭제 버튼 가로 배치 행 */
export const MATCHING_ACTION_BTN_ROW_CLASS =
  "pointer-events-auto mx-auto flex w-full max-w-[min(92%,36rem)] items-center justify-center gap-[clamp(0.55rem,1.15vw,0.85rem)]"

/** 게임시작·방 삭제 이미지 버튼 공통 */
export const MATCHING_ACTION_BTN_CLASS =
  "group w-[clamp(8.5rem,18vw,11.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

/** 게임시작·방 삭제 버튼 이미지 위 텍스트 라벨 */
export const MATCHING_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading text-[clamp(0.88rem,1.25vw,1.05rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

/** 방코드 보기 버튼 이미지 위 텍스트 라벨 */
export const MATCHING_ROOM_CODE_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading text-[clamp(0.82rem,1.1vw,0.95rem)] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 매칭 팝업 프레임 상단 제목 ("멀티 플레이 매칭") */
export const MATCHING_TITLE_CLASS =
  "pointer-events-none absolute left-1/2 top-[5.85%] z-[2] w-[72%] -translate-x-1/2 text-center font-display text-[clamp(2rem,3.15vw,2.75rem)] font-medium leading-none tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_1px_1px_rgba(0,0,0,0.45)]"

/** 팝업 본문 안내 문구 (prompt) */
export const MATCHING_PROMPT_CLASS =
  "text-center font-subheading text-[clamp(1.38rem,1.92vw,1.58rem)] font-bold leading-snug text-[#1a1008]"

/** 파티 슬롯 2행 그리드 wrapper — MatchingPartySlots */
export const MATCHING_SLOTS_GRID_CLASS =
  "mt-[clamp(1.15rem,2.35vh,1.75rem)] flex min-h-[clamp(6.65rem,13.5vh,9.35rem)] shrink-0 flex-col items-center justify-center gap-[clamp(0.42rem,0.88vh,0.68rem)]"

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

/** 타이머 바 이미지 */
export const MATCHING_TIMER_BAR_CLASS =
  "mx-auto block h-auto w-[min(100%,clamp(21rem,47vw,32rem))] select-none object-contain"

/** 타이머 바 + 남은 시간 텍스트 블록 */
export const MATCHING_TIMER_BLOCK_CLASS =
  "mt-[clamp(0.58rem,1.2vh,0.92rem)] shrink-0 -translate-y-[clamp(0.25rem,0.55vh,0.42rem)]"

/** "N초 남았습니다" 타이머 문구 */
export const MATCHING_TIMER_TEXT_CLASS =
  "mt-[clamp(0.25rem,0.52vh,0.4rem)] text-center font-subheading text-[clamp(1.08rem,1.42vw,1.22rem)] font-bold text-[#1a1008]"

/** 키보드 입력 제한 아이콘 + 문구 행 */
export const MATCHING_RESTRICTION_BLOCK_CLASS =
  "mt-[clamp(0.2rem,0.42vh,0.35rem)] flex shrink-0 -translate-y-[clamp(0.25rem,0.55vh,0.42rem)] items-center justify-center gap-[clamp(0.34rem,0.68vw,0.5rem)]"

/** "키보드 입력 제한" 문구 */
export const MATCHING_RESTRICTION_TEXT_CLASS =
  "font-subheading text-[clamp(0.94rem,1.2vw,1.06rem)] font-bold text-[#2a1810]/90"

/** 제한 표시 아이콘 이미지 */
export const MATCHING_RESTRICTION_ICON_CLASS =
  "block h-[clamp(1.28rem,1.82vw,1.48rem)] w-auto shrink-0 select-none object-contain"

/** GameMatchingPage 우상단 파티 인원 헤더 wrapper */
export const MATCHING_PARTY_HEADER_CLASS =
  "absolute top-[2.5%] right-[2.5%] z-20 flex items-center gap-[clamp(0.5rem,0.95vw,0.72rem)] sm:top-[3%] sm:right-[3%]"

/** "파티 인원 N명" 텍스트 (숫자 제외) */
export const MATCHING_PARTY_TEXT_CLASS =
  "font-subheading text-[clamp(1.28rem,1.72vw,1.5rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

/** 파티 인원 숫자만 — 신라문화체 + 골드 톤 강조 */
export const MATCHING_PARTY_COUNT_CLASS =
  "font-display text-[clamp(1.55rem,2.1vw,1.82rem)] font-medium leading-none text-text-main tabular-nums antialiased"

/** 파티 헤더 미준비 실루엣 아이콘 */
export const MATCHING_PARTY_ICON_CLASS =
  "block h-[clamp(1.9rem,2.65vw,2.35rem)] w-auto shrink-0 select-none object-contain opacity-95"

/** 방코드 모달 — 팝업 닫기 */
export const MATCHING_MODAL_CLOSE_BTN_CLASS =
  "group absolute right-[clamp(-0.4rem,-1%,-0.15rem)] top-[clamp(0.95rem,4.2%,1.65rem)] z-20 block w-[clamp(3.75rem,7.4vw,5.1rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"
