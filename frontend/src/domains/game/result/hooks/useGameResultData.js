import { useMemo } from "react"
import { useInGameStore } from "../../ingame/store/ingameStore.js"
import { buildGameResultViewModel } from "../utils/buildGameResultViewModel.js"

/**
 * 실제로 끝난 게임의 결과(store의 winResult)를 결과 페이지 view model로 만든다.
 *
 * 개발용 더미를 공급하는 useGameResultPreview를 대체하는 실데이터 경로다 — 그 훅과
 * gameResultPreviewData는 그대로 남아 `?outcome=` 진입에 계속 쓰인다.
 *
 * self.team까지 함께 읽는 이유: 이 저장소의 game-core는 winResult에 { winner }만 싣고
 * 전원 정체 공개를 내려주지 않으므로, 본인 승패는 store가 이미 갖고 있는 본인 진영으로만
 * 판정할 수 있다(buildGameResultViewModel 주석 참고).
 *
 * @flow store에 winResult가 없으면(게임이 끝나지 않았거나 세션이 정리됨) null을 돌려준다 —
 *   호출부가 그때 로비로 돌려보낸다. 있으면 본인 uuid·team과 함께 buildGameResultViewModel에
 *   넘기고, 그 세 참조가 그대로인 동안에는 같은 결과 참조를 유지한다.
 */
export function useGameResultData() {
  const winResult = useInGameStore((s) => s.state?.winResult ?? null)
  const selfUuid = useInGameStore((s) => s.state?.self?.uuid ?? null)
  const selfTeam = useInGameStore((s) => s.state?.self?.team ?? null)

  return useMemo(
    () => (winResult ? buildGameResultViewModel(winResult, selfUuid, selfTeam) : null),
    [winResult, selfUuid, selfTeam],
  )
}
