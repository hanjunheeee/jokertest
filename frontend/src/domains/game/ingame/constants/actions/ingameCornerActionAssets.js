import { INGAME_PLAYER_CARD_OVERLAY_ASSETS } from "../board/ingamePlayerCardOverlayAssets.js"

/** 화면 우측 하단 단계 행동 버튼(기권·건너뛰기) — 카드 오버레이와 같은 PNG 경로 */
export const INGAME_CORNER_ACTION_ASSETS = {
  abstain: INGAME_PLAYER_CARD_OVERLAY_ASSETS.cancelButton,
  skip: "/button/버튼(미선택).png".normalize("NFD"),
}
