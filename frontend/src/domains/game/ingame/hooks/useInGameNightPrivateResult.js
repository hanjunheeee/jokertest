// 밤 개인 결과 창 훅: 스토어의 내 밤 결과를 창 문구로 바꾸고, 확인하면 지움
// 인게임 화면(InGamePage)이 사용, 문구 계산은 utils/reduceInGameNightPrivateResult.js
import { useInGameStore } from "../store/ingameStore.js"
import { reduceInGameNightPrivateResult } from "../utils/reduceInGameNightPrivateResult.js"

// 창 열림·결과 문구와 확인 (앞 연출 중이면 hold로 안 엶)
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
