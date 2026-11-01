// 플레이어 카드 틀 그림(산 사람·죽은 사람 8종)과 카드 이름판 모양
// 플레이어 카드·이름판·카드 틀 고르기·결과 화면이 사용

// 카드 틀 그림 폴더 (경로는 NFC로 맞춰 씀)
const PLAYER_CARD_ALIVE_DIR = "/shopItem/player-card/playerframe-alive"
const PLAYER_CARD_DEAD_DIR = "/shopItem/player-card/playerframe-dead"

const nfc = (assetPath) => assetPath.normalize("NFC")

// 산 사람·죽은 사람 카드 틀 8종 (같은 자리끼리 짝)
export const INGAME_PLAYER_ALIVE_FRAME_VARIANTS = [
  nfc(`${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(베이스).png`),
  nfc(`${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(가면).png`),
  nfc(`${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(그레이).png`),
  nfc(`${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(모래시계).png`),
  nfc(`${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(보석).png`),
  nfc(`${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(사슬).png`),
  nfc(`${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(악마).png`),
  nfc(`${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(왕관).png`),
]

export const INGAME_PLAYER_DEAD_FRAME_VARIANTS = [
  nfc(`${PLAYER_CARD_DEAD_DIR}/인게임-플레이어프레임(베이스) 사망상태.png`),
  nfc(`${PLAYER_CARD_DEAD_DIR}/인게임-플레이어프레임(가면) 사망상태.png`),
  nfc(`${PLAYER_CARD_DEAD_DIR}/인게임-플레이어프레임(그레이) 사망상태.png`),
  nfc(`${PLAYER_CARD_DEAD_DIR}/인게임-플레이어프레임(모래시계) 사망상태.png`),
  nfc(`${PLAYER_CARD_DEAD_DIR}/인게임-플레이어프레임(보석) 사망상태.png`),
  nfc(`${PLAYER_CARD_DEAD_DIR}/인게임-플레이어프레임(사슬) 사망상태.png`),
  nfc(`${PLAYER_CARD_DEAD_DIR}/인게임-플레이어프레임(악마) 사망상태.png`),
  nfc(`${PLAYER_CARD_DEAD_DIR}/인게임-플레이어프레임(왕관) 사망상태.png`),
]

// 기본 카드 틀 (첫 번째 산 사람 틀)
export const INGAME_PLAYER_ASSETS = {
  cardFrame: INGAME_PLAYER_ALIVE_FRAME_VARIANTS[0],
}

// 카드 이름판 자리·그림자 막·틀 그림·이름 글자 모양
export const INGAME_PLAYER_NAMEPLATE_INSET = {
  bottom: "3%",
  left: "10%",
  right: "10%",
  height: "15%",
}

export const FRAME_SHADOW_LAYER_CLASS =
  "pointer-events-none absolute inset-0 z-0 block h-auto w-full select-none [filter:drop-shadow(0_2px_3px_rgba(10,6,2,0.42))_drop-shadow(0_6px_10px_rgba(8,5,2,0.22))]"

export const FRAME_IMG_CLASS =
  "relative z-10 block h-auto w-full max-w-full select-none [transform:translateZ(0)] [backface-visibility:hidden] [image-rendering:-webkit-optimize-contrast]"

export const INGAME_PLAYER_NAMEPLATE_CLASS =
  "pointer-events-none absolute z-[11] flex items-center justify-center overflow-hidden px-[6%] text-center font-subheading text-[clamp(0.875rem,5.8cqi,1.1rem)] font-bold leading-none tracking-wide text-[#3a1a0c] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
