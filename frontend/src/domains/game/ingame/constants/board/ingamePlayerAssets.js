/**
 * 인게임 플레이어 카드 에셋·inset.
 *
 * InGamePlayerCard·pickInGameJobPortrait·pickInGamePlayerFrame에서 사용합니다.
 * 초상 mask inset은 shared/playerPortraitLayout.js (ingameCard variant).
 */

/** alive 상태 프레임 바리에이션 — playerframe-alive (pickInGamePlayerFrame 순환) */
export const INGAME_PLAYER_ALIVE_FRAME_VARIANTS = [
  "/frame/ingame-playercard/playerframe-alive/인게임-플레이어프레임(베이스).png",
  "/frame/ingame-playercard/playerframe-alive/인게임-플레이어프레임(가면).png",
  "/frame/ingame-playercard/playerframe-alive/인게임-플레이어프레임(그레이).png",
  "/frame/ingame-playercard/playerframe-alive/인게임-플레이어프레임(모래시계).png",
  "/frame/ingame-playercard/playerframe-alive/인게임-플레이어프레임(보석).png",
  "/frame/ingame-playercard/playerframe-alive/인게임-플레이어프레임(사슬).png",
  "/frame/ingame-playercard/playerframe-alive/인게임-플레이어프레임(악마).png",
  "/frame/ingame-playercard/playerframe-alive/인게임-플레이어프레임(왕관).png",
]

/** dead 상태 프레임 — playerframe-dead (alive와 동일 순서·바리에이션) */
export const INGAME_PLAYER_DEAD_FRAME_VARIANTS = [
  "/frame/ingame-playercard/playerframe-dead/인게임-플레이어프레임(베이스) 사망상태.png",
  "/frame/ingame-playercard/playerframe-dead/인게임-플레이어프레임(가면) 사망상태.png",
  "/frame/ingame-playercard/playerframe-dead/인게임-플레이어프레임(그레이) 사망상태.png",
  "/frame/ingame-playercard/playerframe-dead/인게임-플레이어프레임(모래시계) 사망상태.png",
  "/frame/ingame-playercard/playerframe-dead/인게임-플레이어프레임(보석) 사망상태.png",
  "/frame/ingame-playercard/playerframe-dead/인게임-플레이어프레임(사슬) 사망상태.png",
  "/frame/ingame-playercard/playerframe-dead/인게임-플레이어프레임(악마) 사망상태.png",
  "/frame/ingame-playercard/playerframe-dead/인게임-플레이어프레임(왕관) 사망상태.png",
]

/** 인게임 플레이어 카드 public 에셋 (frontend/public 기준) */
export const INGAME_PLAYER_ASSETS = {
  cardFrame: INGAME_PLAYER_ALIVE_FRAME_VARIANTS[0],
}

/** 인게임-플레이어프레임 PNG (323×354) — 하단 닉네임 칸 */
export const INGAME_PLAYER_NAMEPLATE_INSET = {
  bottom: "3%",
  left: "11%",
  right: "11%",
  height: "15%",
}

/** 그림자 전용 레이어 — drop-shadow는 아래 복제 img에만 적용 (위 선명 레이어는 filter 없음) */
export const INGAME_PLAYER_FRAME_SHADOW_LAYER_CLASS =
  "pointer-events-none absolute inset-0 z-0 block h-auto w-full select-none [filter:drop-shadow(0_2px_3px_rgba(10,6,2,0.42))_drop-shadow(0_6px_10px_rgba(8,5,2,0.22))]"

/** 선명 프레임 — 3D 슬롯 transform 합성 시 흐림 완화 */
export const INGAME_PLAYER_FRAME_IMAGE_CLASS =
  "relative z-10 block h-auto w-full max-w-full select-none [transform:translateZ(0)] [backface-visibility:hidden] [image-rendering:-webkit-optimize-contrast]"

/** InGamePlayerCard — 닉네임 텍스트 (프레임 % 기준, 슬롯 transform과 함께 이동) */
export const INGAME_PLAYER_NAMEPLATE_CLASS =
  "pointer-events-none absolute z-[11] flex items-center justify-center overflow-hidden px-[6%] text-center font-subheading text-[clamp(0.8rem,5.8cqi,1.1rem)] font-bold leading-none tracking-wide text-[#3a1a0c]"
