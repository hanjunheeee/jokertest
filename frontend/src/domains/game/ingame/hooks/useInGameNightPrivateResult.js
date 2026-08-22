import { useInGameStore } from "../store/ingameStore.js"
import { reduceInGameNightPrivateResult } from "../utils/reduceInGameNightPrivateResult.js"

/**
 * NIGHT 개인 조사 결과(GUARD의 조사·WITCH_HUNTER의 확인) 오버레이의 표시 상태를 만든다.
 *
 * 다른 오버레이 훅들과 달리 이 훅에는 로컬 pending 큐가 없다 — 결과 자체가 canonical store의
 * nightPrivateResult에 살아 있고, 그 값이 지워지는 시점은 오버레이 확인·NIGHT 재진입·gameId
 * 변경 셋뿐이기 때문이다. 그래서 hold 중에는 그냥 열지 않기만 하면 되고, 그동안 결과가
 * "소비"될 위험이 없다(killReveal·phaseEntrance가 reducer로 pending을 따로 관리해야 했던 것과
 * 다른 지점이다).
 *
 * 표시 전용이다: 소켓 emit·REST가 전혀 없고, confirm은 store의 개인 결과를 비우는 것 외에
 * canonical phase·역할 턴을 조금도 건드리지 않는다.
 *
 * @param {object} [options]
 * @param {boolean} [options.hold] 더 높은 우선순위 오버레이(자기 역할 공개, 사망 연출)가 떠
 *   있는가. true인 동안에는 띄우지 않되 결과는 그대로 보관된다 — 상위 오버레이가 닫히는
 *   즉시 뜬다.
 * @flow store의 payload와 roster를 순수 함수로 정규화한다 — 정규화에 실패하면(대상이 roster에
 *   없는 등) 열지 않고 뒤 순서를 막지도 않는다.
 */
export function useInGameNightPrivateResult({ hold = false } = {}) {
  const payload = useInGameStore((s) => s.nightPrivateResult)
  const players = useInGameStore((s) => s.state?.players ?? null)
  // zustand 액션 참조는 store 생성 시 한 번 고정되므로 그대로 내려도 렌더마다 바뀌지 않는다.
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
