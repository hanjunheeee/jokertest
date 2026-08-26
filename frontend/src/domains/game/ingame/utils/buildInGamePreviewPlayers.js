// 파일 역할: buildInGamePreviewPlayers.js - 여러 곳에서 재사용하는 유틸 함수입니다.
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { getPreviewPlayerStatus } from "../constants/board/status/ingamePlayerStatus.js"
import {
  INGAME_PLAYER_THEME_PALETTE_SIZE,
  resolveInGamePlayerTheme,
} from "../constants/ingamePlayerTheme.js"
import { pickInGameJobPortrait } from "./pickInGameJobPortrait.js"
import { pickInGamePlayerFrame } from "./pickInGamePlayerFrame.js"

/**
 * 더미 인게임 플레이어 목록 — 초상·프레임·상태·테마 포함.
 *
 * 테마는 슬롯 순서 그대로 팔레트를 순환해 결정적으로 배정합니다(랜덤 없음) — 서버 참가자가
 * 있으면 mergeSourcePlayerWithPreview가 이 색을 서버 colorIndex 기반 테마로 덮어쓰므로,
 * 여기 색은 서버 상태 없이 화면만 볼 때의 프리뷰 전용입니다.
 * @param {number} [count=INGAME_PREVIEW_PLAYER_COUNT]
 * @flow 슬롯마다 인덱스를 팔레트 크기로 나눈 나머지를 themeIndex로 삼아 테마를 해석한다.
 */
export function buildInGamePreviewPlayers(
  count = INGAME_PREVIEW_PLAYER_COUNT,
) {
  return Array.from({ length: count }, (_, index) => {
    const themeIndex = index % INGAME_PLAYER_THEME_PALETTE_SIZE

    return {
      id: `player-slot-${index + 1}`,
      nickname: `플레이어 ${index + 1}`,
      portraitSrc: pickInGameJobPortrait(index),
      frameSrc: pickInGamePlayerFrame(index),
      status: getPreviewPlayerStatus(index),
      themeIndex,
      theme: resolveInGamePlayerTheme(themeIndex),
    }
  })
}
