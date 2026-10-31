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

function pickCustomRoleCounts(source) {
  const picked = {}
  for (const key of CUSTOM_ROLE_KEYS) {
    if (Number.isInteger(source?.[key])) picked[key] = source[key]
  }
  return picked
}

export function useRoleCompositionState({ maxPlayers, autoJokerCount, initialComposition, resetKey }) {
  const initial = useMemo(
    () => ({
      mode: initialComposition?.mode === ROLE_COMPOSITION_MODES.CUSTOM
        ? ROLE_COMPOSITION_MODES.CUSTOM
        : ROLE_COMPOSITION_MODES.AUTO,
      roleCounts: initialComposition?.roleCounts
        ? { ...createDefaultCustomRoleCounts(), ...pickCustomRoleCounts(initialComposition.roleCounts) }
        : createDefaultCustomRoleCounts(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialComposition, resetKey],
  )

  const [mode, setMode] = useState(initial.mode)
  const [roleCounts, setRoleCounts] = useState(initial.roleCounts)

  const [appliedInitial, setAppliedInitial] = useState(initial)
  if (appliedInitial !== initial) {
    setAppliedInitial(initial)
    setMode(initial.mode)
    setRoleCounts(initial.roleCounts)
  }

  const selectMode = (nextMode) => {
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

  const setRoleCount = (roleKey, next) =>
    setRoleCounts((prev) => ({ ...prev, [roleKey]: next }))

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
