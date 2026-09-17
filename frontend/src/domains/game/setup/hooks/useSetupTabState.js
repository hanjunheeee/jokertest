import { useMemo, useState } from "react"

/**
 * items 배열을 순회해 checkbox·stepper 타입별 초기 상태 객체를 생성합니다.
 * 이 함수의 결과를 useState 초기값으로 사용하며, items가 바뀔 때만 재실행됩니다.
 */
function buildInitialState(items) {
  const checks = {} // { [id]: boolean } — 체크박스 항목의 ON/OFF 상태
  const ranges = {} // { [id]: number } — 스테퍼 항목의 현재 값
  for (const item of items) {
    if (item.type === "checkbox") checks[item.id] = item.defaultChecked
    if (item.type === "stepper") ranges[item.id] = item.defaultValue
  }
  return { checks, ranges }
}

/**
 * 게임 설정 탭 폼 상태 관리 훅.
 *
 * items 배열(constants)로부터 초기 상태를 파생하고,
 * 체크박스와 스테퍼 각각의 값을 독립적으로 업데이트합니다.
 *
 * F-20: 방 생성은 items의 기본값에서 시작하지만, **이미 존재하는 방의 설정을 편집**할 때는
 * 서버가 확정한 값에서 시작해야 한다. initialState를 주면 그 값이 items 기본값 위에 얹힌다
 * (허용 목록 밖 키는 여기서 만들지 않는다 — 변환은 utils/roomSettingsForm.js가 이미 마쳤고
 * 이 훅은 그 결과를 보관만 한다).
 *
 * @param {Array} items - GENERAL_GAME_SETUP | MEETING_GAME_SETUP 항목 배열
 * @param {{initialState?: {checks?:object, ranges?:object}, resetKey?: unknown}} [options]
 *   resetKey가 바뀌면 상태를 initialState로 다시 맞춘다 — 다른 방으로 옮기거나 서버 설정이
 *   교체됐을 때 이전 방장의 편집 초안이 그대로 남지 않게 하기 위한 명시적 초기화 경계다.
 */
export function useSetupTabState(items, { initialState, resetKey } = {}) {
  const initial = useMemo(() => {
    const base = buildInitialState(items) // items 변경 시에만 재계산
    if (!initialState) return base
    return {
      checks: { ...base.checks, ...(initialState.checks ?? {}) },
      ranges: { ...base.ranges, ...(initialState.ranges ?? {}) },
    }
    // resetKey를 deps에 넣어 "같은 items·같은 초기값 객체 참조라도 다시 맞춰야 하는 순간"을
    // 호출부가 명시할 수 있게 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, initialState, resetKey])

  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환하는 훅입니다.
  // checks: 체크박스 항목들의 현재 ON/OFF 상태, setChecks: 그 값을 갱신하는 함수
  const [checks, setChecks] = useState(initial.checks)
  // ranges: 스테퍼 항목들의 현재 숫자 값, setRanges: 그 값을 갱신하는 함수
  const [ranges, setRanges] = useState(initial.ranges)

  // useState의 초기값은 첫 렌더에만 쓰인다 — 이후 initial이 바뀌어도 자동으로 반영되지
  // 않으므로, 어느 initial을 적용해 둔 상태인지 따로 기억했다가 바뀌는 렌더에서 곧바로
  // 맞춘다(effect로 미루면 한 프레임 동안 옛 값이 보인다).
  const [appliedInitial, setAppliedInitial] = useState(initial)
  if (appliedInitial !== initial) {
    setAppliedInitial(initial)
    setChecks(initial.checks)
    setRanges(initial.ranges)
  }

  /** 특정 id의 체크박스 값을 next로 갱신합니다. */
  const setCheck = (id, next) => setChecks((prev) => ({ ...prev, [id]: next }))
  /** 특정 id의 스테퍼 값을 next로 갱신합니다. */
  const setRange = (id, next) => setRanges((prev) => ({ ...prev, [id]: next }))

  return { checks, ranges, setCheck, setRange }
}
