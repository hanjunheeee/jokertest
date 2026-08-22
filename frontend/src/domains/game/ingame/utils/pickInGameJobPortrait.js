// 파일 역할: pickInGameJobPortrait.js - 여러 곳에서 재사용하는 유틸 함수입니다.
// node:test에는 vite의 "@" alias 해석이 없으므로, 이 모듈을 import하는 순수 함수
// (buildGameResultViewModel)가 테스트에서 그대로 로드되도록 상대 경로로 적는다 —
// useInGameKillReveal.js 등 이미 테스트되는 모듈들과 같은 관례다(동작은 동일).
import { JOB_CLOSEUP_PORTRAITS } from "../../../../shared/constants/playerPortraitAssets.js"
import { pickJobPortrait } from "../../../../shared/utils/pickJobPortrait.js"

/** 슬롯 index 기준 더미 직업 클로즈업 PNG 순환 */
export function pickInGameJobPortrait(index) {
  return pickJobPortrait(index, JOB_CLOSEUP_PORTRAITS)
}
