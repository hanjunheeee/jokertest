/**
 * 로비/마이페이지 배너 레이아웃 상수.
 *
 * MyPageBannerButton은 컴포넌트만 export하고, 재사용 레이아웃 값은 여기서 관리합니다.
 */

/** prototype2(로비) — 배너 내 초상화 제외 텍스트 패널 */
export const LOBBY_TEXT_PANEL_INSET = {
  top: "20%",
  bottom: "17%",
  left: "34%",
  right: "5%",
}

/** 로비·마이페이지 배너 동일 너비 (!: 루트 w-full과 충돌 방지) */
export const LOBBY_BANNER_WIDTH_CLASS =
  "!w-[clamp(18rem,26vw,30rem)] max-w-full shrink-0"
