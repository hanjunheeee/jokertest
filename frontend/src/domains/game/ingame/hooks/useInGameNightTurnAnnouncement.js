import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import {
  getInGameNightTurnAnnouncement,
  INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS,
} from "../constants/nightTurn/ingameNightTurnAnnouncement.js"
import { selectInGameNightTurnRole } from "../utils/selectInGameNightTurnRole.js"
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
 * 한 번에 안내할 수 있는 역할 턴은 최대 하나이며, 그 하나는 언제나 canonical 상태에서만
 * 읽는다(selectInGameNightTurnRole). 이 훅에는 역할 목록도, 커서도, 자동 진행도 없다:
 *
 *   - 닫기는 지금 떠 있는 안내를 닫기만 한다. 다음 역할을 대기열에 넣지 않고, 인덱스를 올리지
 *     않으며, 참가자 구성에서 다음 역할을 추론하지도 않는다.
 *   - 그래서 광대 안내를 닫아도 광대 밤 행동 UI는 그대로 남고(useInGameActionPanel은 자기
 *     역할과 dayIndex만 보고 판단한다), 의사 안내는 canonical 역할 턴이 실제로 DOCTOR로
 *     바뀌었다는 서버발 갱신이 도착해야만 뜬다.
 *   - canonical하게 건너뛰는 역할 턴(day 0의 마녀사냥꾼)은 애초에 identity가 만들어지지 않아
 *     한 프레임도 깜빡이지 않는다.
 *
 * 무엇을 언제 보여줄지는 전부 순수 함수 reduceInGameNightTurnAnnouncement가 결정한다 — 이
 * 훅은 canonical 입력(계정 uuid·gameId·phase·dayIndex·역할 턴·소켓 세대)과 앞 순서 오버레이
 * 여부(hold)를 모아 넘기고 결과를 그대로 노출하기만 한다.
 *
 * 하이드레이션 구분:
 *   재접속 스냅샷(get_session_snapshot)으로 이미 진행 중인 밤에 복원되는 것은 "방금 턴이
 *   바뀐 것"이 아니므로 그 시점의 턴을 baseline으로만 등록하고 안내하지 않는다(그 밤에 이미
 *   지나간 안내들을 몰아서 재생하지 않는다). 그 이후의 실시간 canonical 변경은 정상 안내한다.
 *   판별은 소켓 리스너 등록 순서가 아니라 store의 snapshotSeq로만 한다(useInGamePhaseEntrance와 동일).
 *
 * @param {object} [options]
 * @param {boolean} [options.hold] 더 앞 순서의 오버레이(역할 공개, 사망 연출, DAY/NIGHT 진입
 *   연출)가 떠 있는가. true인 동안에는 안내를 띄우지 않되 "소비됨"으로도 처리하지 않는다 —
 *   "밤이 되었습니다"를 닫는 즉시 반드시 뜬다.
 */
export function useInGameNightTurnAnnouncement({ hold = false } = {}) {
  const gameId = useInGameStore((s) => s.gameId)
  // phase는 따로 읽지 않는다 — "지금 어느 역할 턴인가"의 판정(NIGHT 여부 포함)은 전부
  // selectInGameNightTurnRole 하나에 모여 있다.
  const dayIndex = useInGameStore((s) => s.state?.dayIndex ?? null)
  const nightTurnRole = useInGameStore((s) => selectInGameNightTurnRole(s.state ?? null))
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
  // phase가 NIGHT가 아니거나 canonical하게 건너뛰는 턴이면 selectInGameNightTurnRole이 이미
  // null을 준다 — 그 경우 identity도 null이라 대기·표시 중이던 안내가 즉시 무효가 된다.
  const identity = buildInGameNightTurnAnnouncementIdentity(scope, dayIndex, nightTurnRole)

  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_NIGHT_TURN_ANNOUNCEMENT)
  const lastSnapshotSeqRef = useRef(snapshotSeq)

  useEffect(() => {
    const hydrated = lastSnapshotSeqRef.current !== snapshotSeq
    lastSnapshotSeqRef.current = snapshotSeq
    // reduceInGameNightTurnAnnouncement는 바뀐 것이 없으면 같은 참조를 돌려주므로, StrictMode의
    // setup 이중 실행이나 동일 입력의 반복 관측은 리렌더조차 만들지 않는다.
    setPresentation((current) =>
      reduceInGameNightTurnAnnouncement(current, {
        scope,
        identity,
        role: nightTurnRole,
        dayIndex,
        hold,
        hydrated,
      }),
    )
    // dayIndex·역할 턴은 identity에 이미 녹아 있으므로 deps에서 제외한다 — identity가 같은데
    // 그 둘만 달라지는 경우는 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, identity, hold, snapshotSeq])

  const activeIdentity = presentation.active?.identity ?? null
  const activeRole = presentation.active?.role ?? null

  // 닫기 콜백은 자기가 만들어진 시점의 identity를 캡슐화한다 — 이전 턴·이전 밤·이전 게임·
  // 이전 계정·이전 소켓 세대의 늦은 닫기는 identity 불일치로 아무 일도 하지 않는다.
  const close = useCallback(() => {
    setPresentation((current) => dismissInGameNightTurnAnnouncement(current, activeIdentity))
  }, [activeIdentity])

  // 안내 한 장이 저절로 닫히는 타이머. 닫기와 정확히 같은 동작이며(다음 턴을 열지 않는다),
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
    close,
  }
}
