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
 * 더미 인게임 플레이어 목록 — 초상·프레임·상태·테마(슬롯 index 기반 고정 배정) 포함.
 *
 * 테마를 무작위로 셔플하지 않는다: 실제 판의 색상 배정은 서버가 game_started payload의
 * players[].themeIndex로 내려주고(mergeSourcePlayerWithPreview가 그 값으로 덮어쓴다), 이
 * 함수의 값은 서버 상태가 없을 때만 쓰이는 fallback이다. 여기서 추첨하면 같은 클라이언트
 * 안에서도 렌더마다 색이 바뀌기만 할 뿐 얻는 게 없다.
 * @param {number} [count=INGAME_PREVIEW_PLAYER_COUNT]
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
