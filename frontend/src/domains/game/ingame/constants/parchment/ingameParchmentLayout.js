/**
 * 인게임 파치먼트(양피지) 공용 셸 레이아웃.
 *
 * 역할 공개 오버레이(InGameRoleRevealOverlay)와 밤 역할 턴 안내 오버레이
 * (InGameNightTurnAnnouncementOverlay)가 같은 배경 이미지를 공유한다 —
 * 두 화면이 서로 다른 파치먼트를 그리지 않도록 이 파일 하나만 참조한다.
 *
 * 배경은 준비된 public 에셋(frontend/public/assets/ingame/parchment.png)을 그대로 쓴다.
 * 파일 자체는 불변 자산이라 가공하지 않고, URL만 여기서 한 번 정의한다.
 */

/** 파치먼트 배경 이미지 public URL (frontend/public 기준) */
export const INGAME_PARCHMENT_IMAGE_URL = "/assets/ingame/parchment.png"

/**
 * 파치먼트 프레임 — 이미지의 가로세로비(3:2)를 그대로 유지한다.
 * 폭은 데스크톱(40rem) · 좁은 화면(92vw) · 낮은 화면(132svh = 88svh × 3/2) 중 가장 작은 값으로
 * 정해지므로 어느 방향으로도 뷰포트를 넘지 않는다(가로 스크롤 없음).
 */
export const INGAME_PARCHMENT_FRAME_CLASS =
  "pointer-events-auto relative aspect-[3/2] w-[min(40rem,92vw,132svh)] select-none"

/** 프레임을 가득 채우되 비율을 왜곡하지 않는 배경 이미지 */
export const INGAME_PARCHMENT_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full object-contain"

/**
 * 파치먼트 안쪽(테두리를 제외한 실제 종이 영역)에 내용을 배치한다.
 * 좌우 16% · 상하 17%는 에셋의 찢긴 테두리 바깥으로 글자가 넘치지 않는 안전 영역이다.
 * 내용이 길어지면 안쪽에서만 세로로 스크롤한다.
 */
export const INGAME_PARCHMENT_CONTENT_CLASS =
  "absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-y-auto px-[16%] py-[17%] text-center text-[#3a1a0c]"

/**
 * 배경 이미지 로딩이 실패했을 때의 대체 패널 — 이미지 없이도 같은 톤/가독성을 유지한다
 * (이미지가 없으면 프레임 높이가 잡히지 않으므로 일반 흐름 박스로 그린다).
 */
export const INGAME_PARCHMENT_FALLBACK_FRAME_CLASS =
  "pointer-events-auto relative w-[min(40rem,92vw)] rounded-lg border border-[#6b4321] bg-gradient-to-b from-[#f3e5bd] via-[#e7d19f] to-[#c9a05f] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"

export const INGAME_PARCHMENT_FALLBACK_CONTENT_CLASS =
  "flex max-h-[80svh] flex-col items-center justify-center gap-2 overflow-y-auto px-6 py-7 text-center text-[#3a1a0c]"
