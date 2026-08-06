import { useMemo, useState } from "react"
import {
  MAX_CUSTOM_JOKER_COUNT,
  MIN_CUSTOM_JOKER_COUNT,
  ROLE_COMPOSITION_MODES,
} from "../constants/roleComposition.js"
import {
  createDefaultCustomRoleCounts,
  deriveCitizenCount,
  getFixedRoleCount,
  validateRoleComposition,
} from "../utils/roleComposition.js"

/**
 * 방 생성 화면의 역할 구성(AUTO/CUSTOM) 폼 상태 훅.
 *
 * 판정·파생 계산은 전부 utils/roleComposition.js의 순수 함수가 담당하고, 이 훅은 상태
 * 보관과 재계산 시점만 관리한다(그 덕분에 검증 규칙은 JSX 없이 node:test로 검증된다).
 * maxPlayers가 바뀌면 파생 CITIZEN 수와 검증 결과가 즉시 다시 계산된다 — 값을 조용히
 * 보정하지는 않는다.
 *
 * @param {{maxPlayers:number, autoJokerCount:number}} params
 *   autoJokerCount: AUTO 탭의 기존 광대 수 스테퍼 값(CUSTOM 최초 전환 시 초기값으로 승계)
 */
export function useRoleCompositionState({ maxPlayers, autoJokerCount }) {
  // 기본값은 반드시 AUTO다 — 기존 사용자는 아무것도 건드리지 않으면 지금까지와 똑같이 동작한다.
  const [mode, setMode] = useState(ROLE_COMPOSITION_MODES.AUTO)
  const [roleCounts, setRoleCounts] = useState(createDefaultCustomRoleCounts)

  const selectMode = (nextMode) => {
    // AUTO → CUSTOM 전환 시 방금까지 보던 광대 수를 그대로 이어받는다(값이 갑자기 1로
    // 되돌아간 것처럼 보이지 않게). 범위를 벗어난 값은 승계하지 않되 보정도 하지 않는다.
    if (
      nextMode === ROLE_COMPOSITION_MODES.CUSTOM &&
      mode !== ROLE_COMPOSITION_MODES.CUSTOM &&
      Number.isInteger(autoJokerCount) &&
      autoJokerCount >= MIN_CUSTOM_JOKER_COUNT &&
      autoJokerCount <= MAX_CUSTOM_JOKER_COUNT
    ) {
      setRoleCounts((prev) => ({ ...prev, JOKER: autoJokerCount }))
    }
    setMode(nextMode)
  }

  /** 특정 역할의 인원 수를 next로 갱신합니다(보정 없음). */
  const setRoleCount = (roleKey, next) =>
    setRoleCounts((prev) => ({ ...prev, [roleKey]: next }))

  // maxPlayers·roleCounts·mode 중 하나라도 바뀌면 즉시 다시 계산된다.
  const validation = useMemo(
    () => validateRoleComposition({ mode, roleCounts, maxPlayers }),
    [mode, roleCounts, maxPlayers],
  )
  const citizenCount = useMemo(
    () => deriveCitizenCount(maxPlayers, roleCounts),
    [maxPlayers, roleCounts],
  )
  const fixedRoleCount = useMemo(() => getFixedRoleCount(roleCounts), [roleCounts])

  return {
    mode,
    selectMode,
    roleCounts,
    setRoleCount,
    validation,
    citizenCount,
    fixedRoleCount,
    isCustom: mode === ROLE_COMPOSITION_MODES.CUSTOM,
  }
}
