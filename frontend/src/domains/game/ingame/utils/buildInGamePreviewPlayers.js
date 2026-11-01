// 미리보기 참가자 칸 만들기: 칸 번호별 이름·초상·테두리·상태·색
// 플레이어 세션 훅(useInGamePlayerSession)·재판 연출 미리보기 자료가 사용
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { getPreviewPlayerStatus } from "../../shared/constants/ingamePlayerStatus.js"
import {
  INGAME_PLAYER_THEME_PALETTE_SIZE,
  resolveInGamePlayerTheme,
} from "../../../../shared/constants/ingamePlayerTheme.js"
import { pickInGameJobPortrait } from "./pickInGameJobPortrait.js"
import { pickInGamePlayerFrame } from "./pickInGamePlayerFrame.js"

// 칸 수만큼 가짜 참가자 (실제 참가자는 세션 훅이 이 위에 덧입힘)
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
