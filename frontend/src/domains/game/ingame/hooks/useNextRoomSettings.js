/**
 * F-24(AC-04/AC-05/RESTORE-24): 인게임 "다음 게임 동일 설정 유지" 선택의 **실제 연결부**.
 *
 * 이 훅이 하는 일은 하나다 — 방관리 탭의 체크박스를 "지금 이 계정 · 지금 이 판 · 서버가 확정한
 * 설정 원본"에 묶어, 영속 저장소(useNextRoomSettingsStore)에 넘긴다. 저장 매체·정제·실패
 * 상태는 전부 그 store의 몫이고, 여기서는 **켜도 되는 상황인가**만 판단한다.
 *
 * 왜 화면이 아니라 훅인가: 예전 SettingRoomTab은 체크를 지역 useState에만 담았다. 그 값은
 * 패널을 닫는 순간 사라지므로, 방장이 유지를 켜도 다음 방에는 아무 일도 일어나지 않았다.
 *
 * 켤 수 있는 조건(전부 성립해야 한다)
 *   1. 인증된 계정이 있다.
 *   2. 그 계정이 지금 이 판의 참가자이고 아직 참여 중이다(이탈·추방된 화면의 선택은 이 판의
 *      설정을 말할 자격이 없다).
 *   3. 서버가 확정한 복원 원본(state.roomSettingsSource)이 도착했다. 도착 전에는 **대기**이고,
 *      누락·손상이면 **복원 불가**다 — 둘을 같은 말로 다루면 기다리면 되는 상황과 영영 안 되는
 *      상황이 구별되지 않는다(A-01).
 *
 * 저장 범위는 같은 브라우저·같은 계정의 localStorage 하나뿐이다(A-08). 그 사실을 문구로
 * 그대로 알린다 — 다른 브라우저에서도 복원된다고 믿게 두지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import {
  NEXT_ROOM_SETTINGS_STATUS,
  useNextRoomSettingsStore,
} from "@/domains/game/setup/store/nextRoomSettingsStore.js"
import { useInGameStore } from "../store/ingameStore.js"

/** 유지 선택이 지금 가능한지·왜 불가능한지의 안정적 식별자. */
export const NEXT_ROOM_SETTINGS_AVAILABILITY = Object.freeze({
  READY: "READY",
  /** 인증된 계정이 없다. */
  NO_ACCOUNT: "NO_ACCOUNT",
  /** 이 판의 참가자가 아니거나 이미 참여가 끝났다. */
  NOT_PARTICIPATING: "NOT_PARTICIPATING",
  /** 서버 원본이 아직 도착하지 않았다 — 기다리면 된다. */
  AWAITING_SOURCE: "AWAITING_SOURCE",
  /** 서버 원본이 없거나 모양이 깨졌다 — 이 판의 설정은 복원할 수 없다. */
  SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE",
})

/** 저장 범위 안내. 화면이 문구를 복붙하지 않도록 여기 한 곳에만 둔다. */
export const NEXT_ROOM_SETTINGS_SCOPE_NOTICE =
  "이 설정은 지금 사용하는 브라우저에 계정별로 저장됩니다. 다른 브라우저에서는 복원되지 않습니다."

/** 상태 코드별 안내 문구. 없는 코드는 문구도 없다(조용한 성공). */
const STATUS_MESSAGES = Object.freeze({
  [NEXT_ROOM_SETTINGS_STATUS.SAVE_FAILED]:
    "다음 게임 설정을 저장하지 못했습니다. 다시 시도해주세요.",
  [NEXT_ROOM_SETTINGS_STATUS.CLEAR_FAILED]:
    "설정 유지 해제를 저장하지 못했습니다. 새로고침하면 이전 설정이 다시 보일 수 있습니다. 다시 시도해주세요.",
})

const AVAILABILITY_MESSAGES = Object.freeze({
  [NEXT_ROOM_SETTINGS_AVAILABILITY.AWAITING_SOURCE]: "방 설정을 불러오는 중입니다. 잠시 후 다시 시도해주세요.",
  [NEXT_ROOM_SETTINGS_AVAILABILITY.SOURCE_UNAVAILABLE]:
    "이 게임의 방 설정을 확인할 수 없어 다음 게임으로 유지할 수 없습니다.",
  [NEXT_ROOM_SETTINGS_AVAILABILITY.NOT_PARTICIPATING]: "이 게임의 참가자만 설정을 유지할 수 있습니다.",
})

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function useNextRoomSettings() {
  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration)

  const gameId = useInGameStore((s) => s.gameId)
  const roomSettingsSource = useInGameStore((s) => s.state?.roomSettingsSource ?? null)
  const selfUuid = useInGameStore((s) => s.state?.self?.uuid ?? null)
  const players = useInGameStore((s) => s.state?.players ?? null)

  const storeAccountId = useNextRoomSettingsStore((s) => s.accountId)
  const enabled = useNextRoomSettingsStore((s) => s.enabled)
  const status = useNextRoomSettingsStore((s) => s.status)
  const selectionGeneration = useNextRoomSettingsStore((s) => s.selectionGeneration)
  const setAccount = useNextRoomSettingsStore((s) => s.setAccount)
  const keepSettings = useNextRoomSettingsStore((s) => s.keepSettings)
  const clearSettings = useNextRoomSettingsStore((s) => s.clearSettings)
  const retryPersist = useNextRoomSettingsStore((s) => s.retryPersist)

  // 계정이 바뀌면 store가 메모리 상태를 통째로 버린다(다른 계정의 영속 키는 건드리지 않는다).
  // identityGeneration을 함께 보는 이유는 A→B→A 왕복 때문이다 — uuid만 보면 값이 원래대로
  // 돌아와 전이 자체가 사라진다.
  useEffect(() => {
    setAccount(accountId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, identityGeneration])

  /**
   * 이 계정이 지금 이 판의 참가자이고 아직 참여 중인가. roster가 아예 없으면(아직 상태가
   * 없는 화면) 모르는 것이므로 false다(fail-closed).
   */
  const isParticipating = useMemo(() => {
    if (!accountId || !gameId || !Array.isArray(players)) return false
    if (selfUuid !== accountId) return false
    const me = players.find((player) => player?.uuid === accountId)
    return Boolean(me) && me.isParticipating !== false
  }, [accountId, gameId, players, selfUuid])

  const availability = useMemo(() => {
    if (!accountId) return NEXT_ROOM_SETTINGS_AVAILABILITY.NO_ACCOUNT
    if (!isParticipating) return NEXT_ROOM_SETTINGS_AVAILABILITY.NOT_PARTICIPATING
    // 원본 키 자체가 없다 = 아직 안 왔다(구버전 서버·도착 전). 있는데 모양이 깨졌다 = 복원 불가.
    if (roomSettingsSource === null) return NEXT_ROOM_SETTINGS_AVAILABILITY.AWAITING_SOURCE
    if (!isPlainObject(roomSettingsSource) || !isPlainObject(roomSettingsSource.settings)) {
      return NEXT_ROOM_SETTINGS_AVAILABILITY.SOURCE_UNAVAILABLE
    }
    return NEXT_ROOM_SETTINGS_AVAILABILITY.READY
  }, [accountId, isParticipating, roomSettingsSource])

  // 계정 전환 직후 한 프레임 동안 store가 아직 옛 계정을 들고 있을 수 있다 — 그 프레임의
  // 클릭이 남의 키를 건드리지 않도록 렌더 경계에서도 대조한다.
  const isAccountScopeCurrent = Boolean(accountId) && storeAccountId === accountId

  /** **켤** 수 있는가. 서버가 확정한 이 판의 원본이 있어야 한다. */
  const canToggle = availability === NEXT_ROOM_SETTINGS_AVAILABILITY.READY && isAccountScopeCurrent
  /**
   * F-24(AC-05): **끌** 수 있는가 — 켜는 조건과 같지 않다.
   *
   * 해제는 이 판의 설정을 말하는 행위가 아니라 "저장해 두지 마라"는 명령이다. 서버 원본이
   * 아직 안 왔거나 손상됐다는 이유로 해제까지 막으면, 이전 판에서 켜 둔 유지를 끌 방법이
   * 사라져 다음 방이 계속 옛 설정으로 만들어진다. 필요한 것은 계정 범위뿐이다.
   */
  const canDisable = isAccountScopeCurrent

  /**
   * F-24(AC-04): **유지가 이미 켜진 채로 다음 판이 시작된 경우**의 원본 갱신.
   *
   * 유지를 한 번 켜 두면 그 다음 게임에서도 켜져 있어야 하고, 그때 저장되는 원본은 지난 판이
   * 아니라 **지금 판**의 설정이어야 한다. 갱신은 (게임 · 선택 세대)당 정확히 한 번이다 —
   * 매 렌더마다 다시 쓰면 해제 직후의 늦은 렌더가 방금 끈 설정을 되살린다.
   *
   * 해제 세대가 우선한다: clearSettings가 세대를 먼저 올리므로, 아래 조건의 enabled는 그
   * 시점 이후 false이고 이 갱신은 실행되지 않는다(A-05).
   */
  const refreshedKeyRef = useRef(null)
  useEffect(() => {
    if (!enabled || !canToggle || !gameId) return
    const key = `${accountId}:${gameId}:${selectionGeneration}`
    if (refreshedKeyRef.current === key) return
    refreshedKeyRef.current = key
    keepSettings({ accountId, source: roomSettingsSource })
  }, [enabled, canToggle, gameId, accountId, selectionGeneration, roomSettingsSource, keepSettings])

  /**
   * 체크박스 입력. 켜면 정제·쓰기·재읽기 확인까지 마쳐야 켜진 것으로 표시되고, 끄면 세대를
   * 먼저 올린 뒤 삭제(실패 시 비활성 표시)를 시도한다.
   */
  const setKeepSettings = useCallback(
    (next) => {
      if (next) {
        if (!canToggle) return { ok: false, status }
        return keepSettings({ accountId, source: roomSettingsSource })
      }
      // 해제는 원본 없이도 가능하다(위 canDisable 주석 참고).
      if (!canDisable) return { ok: false, status }
      return clearSettings({ accountId })
    },
    [canToggle, canDisable, accountId, roomSettingsSource, keepSettings, clearSettings, status],
  )

  const retry = useCallback(() => retryPersist(), [retryPersist])

  const failed = status === NEXT_ROOM_SETTINGS_STATUS.SAVE_FAILED
    || status === NEXT_ROOM_SETTINGS_STATUS.CLEAR_FAILED

  return {
    /** 화면 체크 상태. 영속 확인까지 끝난 사실만 true다. */
    enabled,
    canToggle,
    /** 해제만 가능한 상태(원본 없음·손상)에서도 체크를 끌 수 있어야 한다(AC-05). */
    canDisable,
    availability,
    setKeepSettings,
    status,
    /** 실패 안내(성공·정상 대기에는 빈 문자열). */
    statusMessage: STATUS_MESSAGES[status] ?? AVAILABILITY_MESSAGES[availability] ?? "",
    /** 실패가 남아 있을 때만 재시도를 제공한다. */
    canRetry: failed,
    retry,
    scopeNotice: NEXT_ROOM_SETTINGS_SCOPE_NOTICE,
  }
}
