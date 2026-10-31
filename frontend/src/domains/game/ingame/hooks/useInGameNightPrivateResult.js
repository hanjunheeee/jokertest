import { useInGameStore } from "../store/ingameStore.js"
import { reduceInGameNightPrivateResult } from "../utils/reduceInGameNightPrivateResult.js"

export function useInGameNightPrivateResult({ hold = false } = {}) {
  const payload = useInGameStore((s) => s.nightPrivateResult)
  const players = useInGameStore((s) => s.state?.players ?? null)
  const confirm = useInGameStore((s) => s.clearNightPrivateResult)

  const display = reduceInGameNightPrivateResult(payload, players)

  return {
    open: !hold && display !== null,
    kind: display?.kind ?? null,
    label: display?.label ?? null,
    targetNickname: display?.targetNickname ?? null,
    confirm,
  }
}
