import { useMemo } from "react"
import { useInGameStore } from "../../ingame/store/ingameStore.js"
import { buildGameResultViewModel } from "../utils/buildGameResultViewModel.js"

/**
 * 실제로 끝난 게임의 결과(store의 winResult)를 결과 페이지 view model로 만든다.
 *
 * 개발용 더미를 공급하는 useGameResultPreview를 대체하는 실데이터 경로다 — 그 훅과
 * gameResultPreviewData는 그대로 남아 `?outcome=` 진입에 계속 쓰인다.
 *
 * @flow store에 winResult가 없으면(게임이 끝나지 않았거나 세션이 정리됨) null을 돌려준다 —
 *   호출부가 그때 로비로 돌려보낸다. 있으면 본인 uuid와 함께 buildGameResultViewModel에 넘기고,
 *   winResult/selfUuid 참조가 그대로인 동안에는 같은 결과 참조를 유지한다.
 */
export function useGameResultData() {
  const winResult = useInGameStore((s) => s.state?.winResult ?? null)
  const selfUuid = useInGameStore((s) => s.state?.self?.uuid ?? null)

  return useMemo(
    () => (winResult ? buildGameResultViewModel(winResult, selfUuid) : null),
    [winResult, selfUuid],
  )
}
