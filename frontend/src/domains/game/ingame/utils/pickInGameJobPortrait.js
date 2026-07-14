// 파일 역할: pickInGameJobPortrait.js - 여러 곳에서 재사용하는 유틸 함수입니다.
import { JOB_CLOSEUP_PORTRAITS } from "@/shared/constants/playerPortraitAssets.js"
import { pickJobPortrait } from "@/shared/utils/pickJobPortrait.js"

/** 슬롯 index 기준 더미 직업 클로즈업 PNG 순환 */
export function pickInGameJobPortrait(index) {
  return pickJobPortrait(index, JOB_CLOSEUP_PORTRAITS)
}
