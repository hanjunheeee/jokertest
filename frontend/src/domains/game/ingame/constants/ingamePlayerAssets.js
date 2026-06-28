/**
 * 인게임 플레이어 카드 에셋·inset.
 *
 * InGamePlayerCard·pickInGameJobPortrait에서 사용합니다.
 */

/** 인게임 플레이어 카드 public 에셋 (frontend/public 기준) */
export const INGAME_PLAYER_ASSETS = {
  cardFrame: "/frame/플레이어카드프레임-베이스.png",
  nameplate: "/frame/플레이어 이름표.png",
}

/** 더미 — jobs-standing 전신 PNG (상반신 크롭용) */
export const INGAME_JOB_STANDING_PORTRAITS = [
  "/frame/jobs-standing/귀족1.png",
  "/frame/jobs-standing/귀족2.png",
  "/frame/jobs-standing/귀족3.png",
  "/frame/jobs-standing/광대1.png",
  "/frame/jobs-standing/광대2.png",
  "/frame/jobs-standing/경비원1.png",
  "/frame/jobs-standing/경비원2.png",
  "/frame/jobs-standing/경비원3.png",
  "/frame/jobs-standing/주치의.png",
]

/** 직업 초상 PNG 배치 inset */
export const INGAME_PLAYER_PORTRAIT_INSET = {
  top: "0%",
  bottom: "10%",
  left: "20%",
  right: "11%",
}

/** 프레임 안쪽 창 — 배경만 적용 (프레임 밖으로 삐져나오지 않도록) */
export const INGAME_PLAYER_PORTRAIT_BG_INSET = {
  top: "12%",
  bottom: "16%",
  left: "12%",
  right: "12%",
}
