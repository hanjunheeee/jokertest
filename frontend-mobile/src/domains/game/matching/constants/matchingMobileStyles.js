// 대기방 모바일 화면 공통 모양 class·그림 경로·문구
// 대기방 모바일 컴포넌트(위 줄·자리·바닥 줄·시트들)가 씀

// 시트 닫기 그림 (데스크톱 팝업 닫기 버튼과 같음)
export const CLOSE_BUTTON_SRC = "/button/팝업 닫기 버튼.png"

// 뒤로 가기·음소거·친구 초대 그림
export const BACK_BUTTON_SRC = "/button/뒤로가기 버튼2.png".normalize("NFD")

// 위 줄 동그란 아이콘 버튼 (누를 자리 44px)
export const ICON_BTN_CLASS =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none active:scale-95 disabled:cursor-default disabled:opacity-40"

// 양피지 판 (가운데 대기방 판·방코드·설정 본문)
export const PARCHMENT_CLASS =
  "rounded-xl border-2 border-[#5b4a36] bg-[#cdb68a] text-[#1a1008] shadow-[inset_0_0_24px_rgba(90,60,30,0.45),0_10px_30px_rgba(0,0,0,0.55)]"

// 어두운 시트 본문 글자
export const DARK_TEXT_CLASS = "text-[#f5f0e6]"

// 시트 안 보조 글자 (작은 안내)
export const SHEET_NOTE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:0.85rem] leading-snug"

// 오류 글자 (어두운 바탕 / 양피지 바탕)
export const ERROR_ON_DARK_CLASS =
  "font-subheading app-text-scaled [--app-text-size:0.85rem] font-semibold leading-snug text-[#ffb3a7]"
export const ERROR_ON_PARCHMENT_CLASS =
  "font-subheading app-text-scaled [--app-text-size:0.9rem] font-bold leading-snug text-[#8c1c13]"

// 그림 버튼 글자 (데스크톱 그림 버튼과 같은 흰 글자·그림자)
export const IMAGE_BTN_LABEL_CLASS =
  "relative z-[1] px-2 font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 시트 안 줄 목록 (친구 초대·추방)
export const SHEET_ROW_CLASS =
  "flex min-h-[3.75rem] items-center gap-3 border-b border-[#c9b892]/20 py-2 last:border-b-0"

// 방장 메뉴 문구
export const ROOM_MENU_COPY = {
  open: "방장 메뉴",
  title: "방장 메뉴",
  kickLockedHint: "방 정보를 서버에서 확인하는 중입니다",
}

// 방코드 시트 문구 (데스크톱은 틀 그림 안 글자)
export const ROOM_CODE_COPY = {
  title: "초대 방코드",
  description: "이 코드를 친구에게 알려주면 이 방에 참여할 수 있습니다.",
  open: "초대코드 공유",
  copy: "방코드 복사",
  copied: "복사됨",
  checkingHint: "방 확인이 끝나면 코드를 볼 수 있습니다.",
}

// 자리 표시 문구
export const SLOT_COPY = {
  host: "방장",
  me: "나",
  unknownName: "참가자",
  emptyRoom: "아직 들어온 사람이 없습니다.",
}
