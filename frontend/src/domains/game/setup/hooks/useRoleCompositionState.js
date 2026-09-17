import { useMemo, useState } from "react"
import {
  CUSTOM_ROLE_KEYS,
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

/** 허용된 4개 역할 키만 골라낸 새 객체(CITIZEN·관전자 등 다른 키는 상태로 만들지 않는다). */
function pickCustomRoleCounts(source) {
  const picked = {}
  for (const key of CUSTOM_ROLE_KEYS) {
    if (Number.isInteger(source?.[key])) picked[key] = source[key]
  }
  return picked
}

/**
 * 방 생성 화면의 역할 구성(AUTO/CUSTOM) 폼 상태 훅.
 *
 * 판정·파생 계산은 전부 utils/roleComposition.js의 순수 함수가 담당하고, 이 훅은 상태
 * 보관과 재계산 시점만 관리한다(그 덕분에 검증 규칙은 JSX 없이 node:test로 검증된다).
 * maxPlayers가 바뀌면 파생 CITIZEN 수와 검증 결과가 즉시 다시 계산된다 — 값을 조용히
 * 보정하지는 않는다.
 *
 * @param {{maxPlayers:number, autoJokerCount:number,
 *          initialComposition?:{mode:string, roleCounts:object|null}, resetKey?:unknown}} params
 *   autoJokerCount: AUTO 탭의 기존 광대 수 스테퍼 값(CUSTOM 최초 전환 시 초기값으로 승계)
 *   initialComposition: F-20 편집 화면처럼 서버가 확정한 구성에서 시작할 때의 초기값.
 *     주지 않으면 지금까지처럼 AUTO + 기본 roleCounts에서 시작한다(생성 화면).
 *   resetKey: 이 값이 바뀌면 상태를 initialComposition으로 다시 맞춘다 — 방·설정 버전이
 *     교체됐을 때 이전 편집 초안이 새 서버 값 위에 남지 않게 하는 명시적 경계다.
 */
export function useRoleCompositionState({ maxPlayers, autoJokerCount, initialComposition, resetKey }) {
  // 기본값은 반드시 AUTO다 — 기존 사용자는 아무것도 건드리지 않으면 지금까지와 똑같이 동작한다.
  const initial = useMemo(
    () => ({
      mode: initialComposition?.mode === ROLE_COMPOSITION_MODES.CUSTOM
        ? ROLE_COMPOSITION_MODES.CUSTOM
        : ROLE_COMPOSITION_MODES.AUTO,
      // 허용 키만 새 객체로 옮긴다 — 서버/호출부 객체를 그대로 상태로 삼으면 나중에 그 객체가
      // 변형될 때 폼이 조용히 따라 바뀐다.
      roleCounts: initialComposition?.roleCounts
        ? { ...createDefaultCustomRoleCounts(), ...pickCustomRoleCounts(initialComposition.roleCounts) }
        : createDefaultCustomRoleCounts(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialComposition, resetKey],
  )

  const [mode, setMode] = useState(initial.mode)
  const [roleCounts, setRoleCounts] = useState(initial.roleCounts)

  // useSetupTabState와 같은 이유·같은 방식으로, 초기값이 교체되면 그 렌더에서 곧바로 맞춘다.
  const [appliedInitial, setAppliedInitial] = useState(initial)
  if (appliedInitial !== initial) {
    setAppliedInitial(initial)
    setMode(initial.mode)
    setRoleCounts(initial.roleCounts)
  }

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
