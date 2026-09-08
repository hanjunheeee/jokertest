// 파일 역할: pickInGameJobPortrait.js - 여러 곳에서 재사용하는 유틸 함수입니다.
// 상대 경로로 두는 이유: node --test는 Vite의 "@" alias를 해석하지 못한다. 이 모듈은
// 슬롯 index → 직업 초상 매핑 계약을 실제 상수로 검증해야 해서(mock 없이) 테스트에서
// 직접 import한다. shared/utils/__tests__/pickJobPortrait.test.js 참고.
import { JOB_CLOSEUP_PORTRAITS } from "../../../../shared/constants/playerPortraitAssets.js"
import { pickJobPortrait } from "../../../../shared/utils/pickJobPortrait.js"

/** 슬롯 index 기준 더미 직업 클로즈업 PNG 순환 */
export function pickInGameJobPortrait(index) {
  return pickJobPortrait(index, JOB_CLOSEUP_PORTRAITS)
}
