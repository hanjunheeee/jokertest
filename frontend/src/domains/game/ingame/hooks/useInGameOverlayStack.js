import { useInGameRoleReveal } from "./useInGameRoleReveal.js"
import { useInGamePhaseEntrance } from "./useInGamePhaseEntrance.js"
import { useInGameNightTurnAnnouncement } from "./useInGameNightTurnAnnouncement.js"

/**
 * 인게임 오버레이들의 표시 우선순위를 한 곳에서 명시적으로 정한다.
 *
 * 어떤 화면이 먼저 오는지를 렌더 순서·타이밍 경쟁이 아니라 이 함수의 hold 전달 관계로만
 * 결정한다 — 각 오버레이는 자기 앞 순서가 전부 비었을 때에만 열린다.
 *
 *   1. 자기 역할 공개(초기 확인 및 "내 역할 보기" 재열람)
 *   2. 사망 연출 큐(deathRevealActive)
 *   3. DAY/NIGHT 진입 연출("낮이 되었습니다" / "밤이 되었습니다")
 *   4. 밤 역할 턴 안내("광대/의사/경호원/마녀사냥꾼의 시간입니다")
 *   5. 그 아래 게임 표면의 조작
 *
 * 2번(사망 연출)은 아직 이 프런트엔드에 렌더되는 구현이 없다 — 공개 사망 연출 큐를 만드는
 * 순수 헬퍼(buildInGameKillRevealQueueItems)와 문구 상수만 있고 이를 화면에 띄우는
 * 컴포넌트·훅이 없다. 그래서 그 자리를 호출부가 넘겨주는 명시적 입력으로 열어 둔다:
 * 사망 연출 슬라이스가 들어오면 그 훅의 "재생 중" 여부를 deathRevealActive로 넘기기만 하면
 * 3·4번이 자동으로 그 뒤로 밀린다(진입 연출은 기다리는 동안 소비되지 않으므로, 사망 연출이
 * 모두 끝난 뒤에 반드시 뜬다).
 *
 * 이 훅은 표시 상태만 조립한다 — socket emit·REST·canonical store 변경이 전혀 없다.
 *
 * @param {object} [options]
 * @param {boolean} [options.deathRevealActive] 사망 연출 큐가 재생 중인가.
 */
export function useInGameOverlayStack({ deathRevealActive = false } = {}) {
  const roleReveal = useInGameRoleReveal()

  // 1·2번이 하나라도 떠 있으면 3번은 대기한다(대기 중에도 소비되지 않는다).
  const higherPriorityActive = roleReveal.open || deathRevealActive
  const phaseEntrance = useInGamePhaseEntrance({ hold: higherPriorityActive })

  // 4번은 3번이 완전히 끝나야(대기 중인 것도 없어야) 시작한다 — "밤이 되었습니다"를 닫기
  // 전에는 역할 턴 안내가 뜨지도, 타이머로 소진되지도 않는다.
  const nightTurn = useInGameNightTurnAnnouncement({
    hold: higherPriorityActive || phaseEntrance.armed,
  })

  return {
    roleReveal,
    phaseEntrance,
    nightTurn,
    // 진입 연출이 화면을 덮고 있는 동안에는 아래 게임 표면(낮 투표·채팅·재판·밤 행동·결과
    // 컨트롤)의 입력을 잠근다. 역할 공개 재열람이나 밤 역할 턴 안내는 기존대로 아래 화면을
    // 잠그지 않는다(기존 동작 유지).
    interactionBlocked: phaseEntrance.blocking,
  }
}
