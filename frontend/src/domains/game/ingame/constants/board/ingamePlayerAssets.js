/**
 * 인게임 플레이어 카드 에셋·inset.
 *
 * InGamePlayerCard·pickInGameJobPortrait에서 사용합니다.
 * 초상 mask inset은 shared/playerPortraitLayout.js (ingameCard variant).
 */

/** 인게임 플레이어 카드 public 에셋 (frontend/public 기준) */
export const INGAME_PLAYER_ASSETS = {
  cardFrame: "/frame/ingame-playercard/인게임-플레이어프레임(베이스).png",
}

/** 인게임-플레이어프레임(베이스).png (375×406) — 하단 닉네임 칸 */
export const INGAME_PLAYER_NAMEPLATE_INSET = {
  bottom: "7.5%",
  left: "11%",
  right: "11%",
  height: "15%",
}

/** InGamePlayerCard — 닉네임 텍스트 (프레임 % 기준, 슬롯 transform과 함께 이동) */
export const INGAME_PLAYER_NAMEPLATE_CLASS =
  "pointer-events-none absolute z-[11] flex items-center justify-center overflow-hidden px-[6%] text-center font-subheading text-[clamp(0.8rem,5.8cqi,1.1rem)] font-bold leading-none tracking-wide text-[#3a1a0c]"

/** 카드-배경 접착감 — 프레임 알파를 따라가는 은은한 그림자 */
export const INGAME_PLAYER_CARD_SHADOW_CLASS =
  "[filter:drop-shadow(0_2px_3px_rgba(10,6,2,0.42))_drop-shadow(0_6px_10px_rgba(8,5,2,0.22))]"
