import { useInGameRoleReveal } from "./useInGameRoleReveal.js"
import { useInGameKillReveal } from "./useInGameKillReveal.js"
import { useInGamePhaseEntrance } from "./useInGamePhaseEntrance.js"
import { useInGameNightTurnAnnouncement } from "./useInGameNightTurnAnnouncement.js"

/**
 * 인게임 오버레이들의 표시 우선순위를 한 곳에서 명시적으로 정한다.
 *
 * 어떤 화면이 먼저 오는지를 렌더 순서·타이밍 경쟁이 아니라 이 함수의 hold 전달 관계로만
 * 결정한다 — 각 오버레이는 자기 앞 순서가 전부 비었을 때에만 열린다.
 *
 *   1. 자기 역할 공개(초기 확인 및 "내 역할 보기" 재열람)
 *   2. 사망 연출 큐(killReveal — night_result_applied의 공개 deathReveals)
 *   3. DAY/NIGHT 진입 연출("낮이 되었습니다" / "밤이 되었습니다")
 *   4. 밤 역할 턴 안내("광대/의사/경호원/마녀사냥꾼의 시간입니다")
 *   5. 그 아래 게임 표면의 조작
 *
 * 2번(killReveal)은 1번이 떠 있는 동안 보류된다(hold) — 자기 역할 확인이 사망 연출보다
 * 먼저다. killReveal.open이 true인 동안(=큐에서 승격된 항목이 실제로 재생 중인 동안) 3·4번이
 * 자동으로 그 뒤로 밀린다 — 진입 연출은 기다리는 동안 소비되지 않으므로, 사망 연출 큐가 모두
 * 끝난 뒤에 반드시 뜬다(같은 밤에 여러 희생자가 있어도 큐가 다 빌 때까지 끊기지 않는다).
 *
 * 이 훅은 표시 상태만 조립한다 — socket emit·REST·canonical store 변경이 전혀 없다.
 */
export function useInGameOverlayStack() {
  const roleReveal = useInGameRoleReveal()
  const killReveal = useInGameKillReveal({ hold: roleReveal.open })

  // 1·2번이 하나라도 떠 있으면 3번은 대기한다(대기 중에도 소비되지 않는다).
  const higherPriorityActive = roleReveal.open || killReveal.open
  const phaseEntrance = useInGamePhaseEntrance({ hold: higherPriorityActive })

  // 4번은 3번이 완전히 끝나야(대기 중인 것도 없어야) 시작한다 — "밤이 되었습니다"를 닫기
  // 전에는 역할 턴 안내가 뜨지도, 타이머로 소진되지도 않는다.
  const nightTurn = useInGameNightTurnAnnouncement({
    hold: higherPriorityActive || phaseEntrance.armed,
  })

  return {
    roleReveal,
    killReveal,
    phaseEntrance,
    nightTurn,
    // 진입 연출·사망 연출이 화면을 덮고 있는 동안에는 아래 게임 표면(낮 투표·채팅·재판·밤
    // 행동·결과 컨트롤)의 입력을 잠근다. killReveal의 불투명 배경이 DAY 진입 연출·ENDED 결과
    // 표시를 시각적으로도 가리므로, 큐가 다 빌 때까지 그 아래 어떤 결과 화면도 보이지 않는다.
    // 역할 공개 재열람이나 밤 역할 턴 안내는 기존대로 아래 화면을 잠그지 않는다(기존 동작 유지).
    interactionBlocked: phaseEntrance.blocking || killReveal.open,
  }
}
