// 공개방 목록 전체 위치와 크기입니다.
// 패널 자체는 키우지 않고(요구사항), 카드 폭을 살짝 좁혀 2열x6행이 같은 세로 공간 안에 들어오도록 합니다.
export const ROOM_LIST_SHELL_CLASS =
  "absolute left-1/2 top-[52%] z-10 flex h-[clamp(40rem,76vh,50rem)] w-[min(60rem,80vw)] min-h-0 max-w-full -translate-x-1/2 -translate-y-1/2 flex-col gap-[clamp(0.45rem,1vh,0.65rem)] px-[clamp(0.35rem,0.9vw,0.65rem)]"

// 방 만들기/코드로 참가 버튼 행입니다.
export const ROOM_LIST_TOOLBAR_CLASS =
  "flex shrink-0 items-center justify-start gap-[clamp(0.35rem,0.8vw,0.55rem)]"

// 방 목록 상단 액션 버튼 wrapper입니다.
export const ROOM_LIST_ACTION_BTN_CLASS =
  "interactive-scale relative min-w-[clamp(5.75rem,11.5vw,7.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

// 방 만들기/코드로 참가 라벨입니다. font-subheading(고딕 프레임과 어울리는 명조 계열),
// 양피지색 텍스트, 한 단계 낮춘 굵기, 약한 그림자로 프레임보다 튀지 않게 합니다.
export const ROOM_LIST_ACTION_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(1.05rem,1.5vw,1.28rem)] font-bold tracking-wide leading-none text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]"

export const ROOM_LIST_ACTION_FRAME_CLASS = "block h-auto w-full select-none"

// 방 목록 패널 바깥 프레임입니다.
export const ROOM_LIST_PANEL_CLASS =
  "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-[#2a2218]/90 bg-[#0a0806]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_rgba(0,0,0,0.45)]"

// 6행이 들어갈 세로 여유를 확보하기 위해 안쪽 상하 여백을 줄였습니다.
export const ROOM_LIST_PANEL_INSET_CLASS =
  "flex min-h-0 flex-1 flex-col px-[clamp(0.55rem,1.4vw,0.85rem)] py-[clamp(0.3rem,0.6vh,0.42rem)]"

export const ROOM_LIST_SCROLL_WRAP_CLASS = "relative min-h-0 flex-1"

// 방 목록 그리드입니다. 좁은 화면은 1열, md 이상은 2열x6행(페이지당 12개)입니다.
// 스크롤은 쓰지 않습니다 — 넘치는 내용은 상위 패널의 overflow-hidden으로 잘립니다.
// 카드 자체 높이는 이미지 종횡비에 따라 폭으로 결정되므로, 6행을 같은 패널 안에 채우기 위해
// 행 간격(gap-y)과 패널 안쪽 여백을 줄이는 방식으로 조정했습니다(패널 크기 자체는 그대로).
export const ROOM_LIST_GRID_CLASS =
  "grid h-full min-h-0 grid-cols-1 content-start gap-x-[clamp(0.35rem,0.75vw,0.5rem)] gap-y-[clamp(0.3rem,0.8vh,0.45rem)] pr-[clamp(0.85rem,1.6vw,1.15rem)] md:grid-cols-2 md:gap-y-[clamp(0.12rem,0.32vh,0.2rem)] md:pr-0"

export const ROOM_LIST_ROW_CLASS = "relative w-full min-w-0 list-none"
export const ROOM_LIST_ROW_FRAME_CLASS =
  "block h-auto w-full select-none transition-[filter] duration-150"

export const ROOM_LIST_ROW_FRAME_SELECTED_CLASS =
  "brightness-[1.12] saturate-[1.42] hue-rotate-[-12deg] drop-shadow-[0_0_5px_rgba(160,28,28,0.9)]"

// 페이지당 방 개수(12개)보다 실제 방이 적을 때 채우는 빈 슬롯입니다. 프레임 이미지를
// invisible로 감춰 자리(높이)만 그대로 차지하게 해서, 페이지가 바뀌어도 그리드 전체
// 높이가 흔들리지 않도록 합니다.
export const ROOM_LIST_ROW_PLACEHOLDER_FRAME_CLASS = `${ROOM_LIST_ROW_FRAME_CLASS} invisible`

// 방 카드 버튼 기본 스타일입니다. 촘촘한 2열x6행 그리드에서는 hover 확대(interactive-scale)
// 대신 밝기 변화를 씁니다 — 확대 시 인접 카드와 겹칠 수 있기 때문입니다.
export const ROOM_LIST_ROW_BUTTON_BASE_CLASS =
  "relative block w-full border-0 bg-transparent p-0 text-left leading-none transition duration-150"

export const ROOM_LIST_ROW_BUTTON_INTERACTIVE_CLASS = "cursor-pointer hover:brightness-110"
export const ROOM_LIST_ROW_BUTTON_DISABLED_CLASS = "cursor-not-allowed"

// 방 목록 행 프레임 위에 텍스트를 얹는 영역입니다. 상단(단계/상태 배지)·하단(제목/인원) 2행 구조입니다.
export const ROOM_LIST_ROW_OVERLAY_CLASS =
  "absolute inset-0 flex flex-col justify-between gap-[clamp(0.05rem,0.3vh,0.15rem)] px-[8%] pt-[5%] pb-[16%]"

export const ROOM_LIST_ROW_TOP_ROW_CLASS = "flex items-center justify-between gap-[clamp(0.3rem,0.8vw,0.45rem)]"

// 단계 배지: 방 이름보다 작고 대비가 낮은, 가장 눈에 덜 띄는 정보입니다.
export const ROOM_LIST_ROW_STAGE_BADGE_CLASS =
  "pointer-events-none shrink-0 font-subheading text-[clamp(0.58rem,0.78vw,0.68rem)] font-medium text-white/65 antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"

export const ROOM_LIST_ROW_STATUS_BADGE_WRAP_CLASS = "flex shrink-0 items-center gap-[clamp(0.25rem,0.6vw,0.35rem)]"

// 코드 방 배지입니다. 전용 자물쇠 아이콘 에셋이 없어 텍스트 배지로 대체합니다(별도 에셋 필요 사항).
export const ROOM_LIST_ROW_LOCK_BADGE_CLASS =
  "pointer-events-none rounded-sm border border-[#cbb27a]/50 bg-black/45 px-[0.4em] py-[0.05em] font-subheading text-[clamp(0.56rem,0.74vw,0.64rem)] font-bold text-[#e8d5a8] antialiased"

const ROOM_LIST_ROW_STATUS_BADGE_BASE_CLASS =
  "pointer-events-none rounded-sm px-[0.4em] py-[0.05em] font-subheading text-[clamp(0.56rem,0.74vw,0.64rem)] font-bold antialiased"

export const ROOM_LIST_ROW_STATUS_BADGE_FULL_CLASS =
  `${ROOM_LIST_ROW_STATUS_BADGE_BASE_CLASS} border border-white/25 bg-black/55 text-white/70`

export const ROOM_LIST_ROW_STATUS_BADGE_IN_PROGRESS_CLASS =
  `${ROOM_LIST_ROW_STATUS_BADGE_BASE_CLASS} border border-[#b50000]/55 bg-[#2a0605]/70 text-[#ff8f87]`

export const ROOM_LIST_ROW_BOTTOM_ROW_CLASS = "flex items-center justify-between gap-[clamp(0.35rem,1vw,0.55rem)]"

// 방 이름: 카드에서 가장 눈에 띄어야 하는 정보입니다. 기존 #f0b45c보다 차분한 #f3d28d를 씁니다.
export const ROOM_LIST_ROW_TITLE_CLASS =
  "pointer-events-none min-w-0 flex-1 truncate text-left font-subheading text-[clamp(0.98rem,1.35vw,1.18rem)] font-bold leading-none text-[#f3d28d] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]"

// 인원수: 작지만 명확하게 읽혀야 하는 정보입니다(semibold, tabular-nums로 자릿수 흔들림 방지).
export const ROOM_LIST_ROW_COUNT_CLASS =
  "pointer-events-none shrink-0 font-subheading text-[clamp(0.62rem,0.88vw,0.76rem)] font-semibold leading-none tabular-nums text-white/95 antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 마감/진행중 카드를 어둡게 덮는 오버레이입니다.
export const ROOM_LIST_ROW_DIM_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 rounded-sm bg-black/55 [filter:grayscale(0.6)]"

// 셸 레벨 하단 영역입니다. 페이지네이션이 목록 패널 내부로 이동했으므로,
// 이제는 입장하기 버튼만 담아 우측에 둡니다.
//
// pr-0: 방목록 셸(패널)과 같은 오른쪽 끝에 맞춥니다. footer 박스는 pointer-events-none이라
// 사운드 컨트롤 위를 지나가도 빈 영역 클릭은 가로채지 않고, 버튼만 pointer-events-auto로
// 받습니다.
export const ROOM_LIST_FOOTER_CLASS =
  "pointer-events-none flex shrink-0 items-center justify-end pr-[0rem]"

// 목록 패널 내부, 카드 그리드 아래에 붙는 고정 높이 페이지네이션 영역입니다.
// shrink-0 + min-height로 크기를 고정해 패널 전체 높이를 다시 키우지 않으면서,
// 카드 6행 아래에 남는 공간을 이 영역이 대신 차지하도록 합니다.
export const ROOM_LIST_PAGINATION_FOOTER_CLASS =
  "flex shrink-0 items-center justify-center min-h-[clamp(2.75rem,6vh,3.75rem)] py-[clamp(0.25rem,0.55vh,0.4rem)]"

export const ROOM_LIST_PAGINATION_CLASS = "flex items-center gap-[clamp(0.45rem,0.85vw,0.65rem)]"

// 페이지 이동 화살표는 기존 뒤로가기 버튼 이미지를 재사용하되, 화면 뒤로가기보다
// 시각적 우선순위가 낮도록 작게 표시합니다.
export const ROOM_LIST_PAGE_ARROW_BTN_CLASS =
  "block w-[clamp(1.75rem,2.5vw,2.15rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 opacity-85 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:opacity-30 disabled:brightness-75"

export const ROOM_LIST_PAGE_ARROW_IMG_CLASS = "block h-auto w-full select-none"

// 현재 페이지 표시: 별도 막대 배경 없이 텍스트만 사용합니다(요구사항 8).
export const ROOM_LIST_PAGE_TEXT_CLASS =
  "shrink-0 px-1 font-subheading text-[clamp(0.95rem,1.25vw,1.1rem)] font-semibold tabular-nums text-[#e8d5a8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"

// pointer-events-auto: ROOM_LIST_FOOTER_CLASS가 빈 영역의 클릭을 흘려보내므로,
// 실제 조작 대상인 이 버튼에서만 클릭을 다시 받습니다.
export const ROOM_LIST_ENTER_BTN_CLASS =
  "pointer-events-auto relative min-w-[clamp(6.25rem,11vw,7.75rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale disabled:hover:opacity-40"

export const ROOM_LIST_ENTER_BTN_FRAME_CLASS = "block h-auto w-full select-none"

// 입장하기 라벨도 방 만들기/코드로 참가와 같은 톤(양피지색, 한 단계 낮춘 굵기, 약한 그림자)으로 통일합니다.
export const ROOM_LIST_ENTER_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.92rem,1.25vw,1.05rem)] font-bold tracking-wide leading-none text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]"
