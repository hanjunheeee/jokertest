import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import {
  getInGameNightTurnAnnouncement,
  INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS,
} from "../constants/nightTurn/ingameNightTurnAnnouncement.js"
import { selectInGameNightTurnReel } from "../utils/selectInGameNightTurnReel.js"
import {
  buildInGameNightTurnAnnouncementIdentity,
  buildInGameNightTurnAnnouncementScope,
} from "../utils/buildInGameNightTurnAnnouncementIdentity.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"
import {
  dismissInGameNightTurnAnnouncement,
  INITIAL_IN_GAME_NIGHT_TURN_ANNOUNCEMENT,
  reduceInGameNightTurnAnnouncement,
} from "../utils/reduceInGameNightTurnAnnouncement.js"

/**
 * 밤(NIGHT) 역할 턴 안내 오버레이의 표시 상태를 관리한다.
 *
 * 표시 전용이다 — socket emit(acknowledge_role_reveal 포함)·REST·canonical store 변경이 전혀
 * 없고, 안내를 닫아도 서버의 역할 턴·phase는 조금도 움직이지 않는다.
 *
 * 이 훅이 따라가는 것은 canonical 역할 턴이 아니라 **연출 릴**이다(selectInGameNightTurnReel).
 * 릴은 그 밤에 안내할 역할을 광대→의사→경호원→마녀사냥꾼 순서로 담은 목록이고, 역할 보유자의
 * 생사를 전혀 보지 않는다 — 죽은 역할의 턴 안내가 사라지면 관찰자가 "안내가 사라짐 = 그 역할
 * 사망"을 추론할 수 있어 사망자의 역할이 전체에 누출되기 때문이다. 그래서:
 *
 *   - 릴 커서는 고정 리듬(INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS)으로만 한 칸씩 전진하고
 *     마지막 칸에서 멈춘다. canonical 턴과는 동기화하지 않는다 — 그 값은 죽은 역할을 건너뛴
 *     판정용 커서라, 거기에 맞추는 순간 죽은 역할의 칸이 다시 사라진다.
 *   - 닫기는 지금 떠 있는 카드를 숨길 뿐 커서를 전진시키지 않는다. 리듬은 모든 창에서 같다.
 *   - 판정은 조금도 바뀌지 않는다. "지금 내 차례인가"는 여전히 canonical 턴을 읽는 행동 패널
 *     (useInGameActionPanel)이 알려주고, 죽은 보유자 본인에게는 그대로 패널이 뜨지 않는다.
 *   - 밤 행동이 없는 역할(CITIZEN)은 릴에 애초에 들어가지 않아 한 프레임도 깜빡이지 않는다.
 *
 * 무엇을 언제 보여줄지는 전부 순수 함수 reduceInGameNightTurnAnnouncement가 결정한다 — 이
 * 훅은 입력(계정 uuid·gameId·dayIndex·릴 커서가 가리키는 역할·소켓 세대)과 앞 순서 오버레이
 * 여부(hold)를 모아 넘기고 결과를 그대로 노출하기만 한다.
 *
 * 하이드레이션 구분:
 *   재접속 스냅샷(get_session_snapshot)으로 이미 진행 중인 밤에 복원되는 것은 "방금 연출이
 *   시작된 것"이 아니므로 커서를 릴의 마지막 칸으로 보내고 그 역할을 baseline으로만 등록한다
 *   (그 밤에 이미 지나간 안내들을 몰아서 재생하지 않는다). 판별은 소켓 리스너 등록 순서가
 *   아니라 store의 snapshotSeq로만 한다(useInGamePhaseEntrance와 동일).
 *
 * @param {object} [options]
 * @param {boolean} [options.hold] 더 앞 순서의 오버레이(역할 공개, 사망 연출, 개인 조사 결과,
 *   DAY/NIGHT 진입 연출)가 떠 있는가. true인 동안에는 안내를 띄우지 않고 커서도 멈춘다 —
 *   "밤이 되었습니다"를 닫는 즉시 릴의 첫 칸이 반드시 뜬다.
 * @flow 릴 키(scope+dayIndex+릴 구성)가 바뀌면 렌더 중에 커서를 첫 칸으로 되돌리고, 스냅샷
 *   하이드레이션이면 마지막 칸으로 보낸다. 그 뒤 릴 커서가 가리키는 역할 하나만 표시 상태
 *   기계에 넘기고, 고정 타이머가 커서를 한 칸씩 전진시킨다.
 */
export function useInGameNightTurnAnnouncement({ hold = false } = {}) {
  const gameId = useInGameStore((s) => s.gameId)
  // phase는 따로 읽지 않는다 — NIGHT 여부를 포함한 "이 밤에 무엇을 재생하는가"의 판정은 전부
  // selectInGameNightTurnReel 하나에 모여 있다.
  const dayIndex = useInGameStore((s) => s.state?.dayIndex ?? null)
  // 릴은 배열이라 그대로 구독하면 매 렌더 새 참조가 나온다(useSyncExternalStore가 싫어하는
  // 모양이다). 구독은 문자열 키 하나로만 하고 배열은 그 키에서 되살린다.
  const reelKey = useInGameStore((s) => selectInGameNightTurnReel(s.state ?? null).join("|"))
  const reelRoles = useMemo(() => (reelKey.length > 0 ? reelKey.split("|") : []), [reelKey])
  const snapshotSeq = useInGameStore((s) => s.snapshotSeq)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 실제 "connect"는 최초 연결이든 재연결이든 항상 새 세대다(useInGamePhaseEntrance와 동일).
  // socket 참조는 그대로인 채 재연결만 일어나는 경우까지 세대로 잡아낸다.
  const [connectSeq, setConnectSeq] = useState(0)
  useEffect(() => {
    if (!socket) return undefined
    const handleConnect = () => setConnectSeq((current) => current + 1)
    socket.on("connect", handleConnect)
    return () => socket.off("connect", handleConnect)
  }, [socket])

  const epochKey = `${getInGameSocketEpochId(socket)}#${connectSeq}`
  const scope = buildInGameNightTurnAnnouncementScope({ gameId, authUuid, epochKey })

  // 릴 커서. reelId가 "지금 재생 중인 릴"이고, 그것이 달라지면(다른 밤·다른 구성·다른 계정·
  // 다른 소켓 세대) 커서를 새 릴의 첫 칸으로 되돌린다. 밤이 아니면 릴이 비어 reelId도 null이다.
  const reelId = reelRoles.length > 0 && scope !== null ? `${scope}#${dayIndex}#${reelKey}` : null
  const [cursor, setCursor] = useState(() => ({ reelId, snapshotSeq, index: 0, hydrated: false }))
  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_NIGHT_TURN_ANNOUNCEMENT)

  // 커서 되돌리기는 effect가 아니라 렌더 중에 한다(React의 "렌더 중 state 조정" 패턴). effect로
  // 미루면 릴이 바뀐 그 한 렌더 동안 scope만 새것이고 커서는 옛것인 상태가 관측돼, "새 scope의
  // 첫 관측은 baseline"이라는 reduce의 규칙 2가 무력화된다(계정·소켓 세대가 바뀐 직후 지나간
  // 안내가 다시 재생된다). 이 조정 렌더의 출력과 effect는 React가 버리므로 그런 중간 상태 자체가
  // 존재하지 않는다. 하이드레이션 판별(snapshotSeq)도 같은 이유로 여기 한 곳에서만 소비한다.
  if (cursor.reelId !== reelId || cursor.snapshotSeq !== snapshotSeq) {
    const hydrated = cursor.snapshotSeq !== snapshotSeq
    // 하이드레이션은 "이미 진행 중인 밤에 복원된 것"이므로 릴의 마지막 칸에서 이어붙인다 —
    // 그 밤에 이미 지나간 안내를 몰아서 재생하지 않는다.
    const nextIndex = hydrated
      ? Math.max(reelRoles.length - 1, 0)
      : cursor.reelId !== reelId
        ? 0
        : cursor.index
    setCursor({ reelId, snapshotSeq, index: nextIndex, hydrated })
  }

  const index = cursor.index
  const reelRole = reelRoles[index] ?? null
  const identity = buildInGameNightTurnAnnouncementIdentity(scope, dayIndex, reelRole)

  useEffect(() => {
    // reduceInGameNightTurnAnnouncement는 바뀐 것이 없으면 같은 참조를 돌려주므로, StrictMode의
    // setup 이중 실행이나 동일 입력의 반복 관측은 리렌더조차 만들지 않는다.
    setPresentation((current) =>
      reduceInGameNightTurnAnnouncement(current, {
        scope,
        identity,
        role: reelRole,
        dayIndex,
        hold,
        hydrated: cursor.hydrated,
      }),
    )
    // dayIndex·릴 역할은 identity에 이미 녹아 있으므로 deps에서 제외한다 — identity가 같은데
    // 그 둘만 달라지는 경우는 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, identity, hold, cursor.hydrated])

  // 릴 전진 타이머 — 이 훅에서 커서를 움직이는 유일한 경로다. 마지막 칸에서 멈추고, hold 동안
  // 에는 아예 시작하지 않으며("밤이 되었습니다"를 닫은 뒤부터 리듬이 흐른다), 하이드레이션으로
  // 마지막 칸에 복원된 경우에는 전진할 칸 자체가 없다.
  useEffect(() => {
    if (hold) return undefined
    if (index >= reelRoles.length - 1) return undefined
    const timer = setTimeout(() => {
      setCursor((current) =>
        current.reelId === reelId && current.index === index ? { ...current, index: index + 1 } : current,
      )
    }, INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS)
    return () => clearTimeout(timer)
  }, [reelId, index, reelRoles.length, hold])

  const activeIdentity = presentation.active?.identity ?? null
  const activeRole = presentation.active?.role ?? null

  // 닫기 콜백은 자기가 만들어진 시점의 identity를 캡슐화한다 — 이전 턴·이전 밤·이전 게임·
  // 이전 계정·이전 소켓 세대의 늦은 닫기는 identity 불일치로 아무 일도 하지 않는다.
  const close = useCallback(() => {
    setPresentation((current) => dismissInGameNightTurnAnnouncement(current, activeIdentity))
  }, [activeIdentity])

  // 안내 한 장이 저절로 닫히는 타이머. 닫기와 정확히 같은 동작이며(릴 커서를 움직이지 않는다),
  // identity가 바뀌면 이전 타이머는 정리되고 새 안내의 타이머만 살아 있다.
  useEffect(() => {
    if (activeIdentity === null) return undefined
    const timer = setTimeout(() => {
      setPresentation((current) => dismissInGameNightTurnAnnouncement(current, activeIdentity))
    }, INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS)
    return () => clearTimeout(timer)
  }, [activeIdentity])

  const announcement =
    activeRole !== null ? getInGameNightTurnAnnouncement(activeRole, presentation.active?.dayIndex ?? null) : null

  return {
    open: presentation.active !== null && announcement !== null,
    announcement,
    identity: activeIdentity,
    role: activeRole,
    // 상태바가 읽는 값 — 오버레이의 열림/닫힘과 무관하게 릴 커서가 가리키는 역할이다. 릴이
    // 끝난 뒤에도 밤이 계속되면 마지막 역할 문구가 그대로 남는다((구성+시신+시간)만의 함수라
    // 누구의 생사도 드러내지 않는다).
    statusRole: reelRole,
    close,
  }
}
