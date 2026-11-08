// 설정 패널에서 손댄 직업별 밤 시간 기억, 전체 밤 시간을 바꾸면 안 손댄 직업도 같이 맞춤 (재판 시간도 낮 투표 시간을 같은 식으로 따라감)
// components/GameSetupPanel·모바일 useSetupForm이 씀
// 서버가 따로 정한 직업·이미 손댄 직업은 전체 밤 시간을 따라가지 않음
import { useState } from "react"
import {
  DAY_VOTE_TIME_ID,
  NIGHT_TIME_ID_TO_ROLE,
  OVERALL_NIGHT_ACTION_TIME_ID,
  TRIBUNAL_TIME_ID,
} from "../constants/roomSettingsForm.js"

// 낮 투표 시간을 바꿀 때 재판 시간도 같이 바꿀지: 이 폼에서 재판 시간을 안 건드렸고 지금 둘이 같은 값일 때만
export function shouldTribunalFollowDayVote(ranges, tribunalEdited) {
  if (tribunalEdited) return false
  return ranges?.[TRIBUNAL_TIME_ID] === ranges?.[DAY_VOTE_TIME_ID]
}

// 손댄 직업별 밤 시간·숫자 바꾸기 처리
export function useNightTimeEdits({ ranges, setRange, initialFormState, formResetKey }) {
  const [editedRoleTimeIds, setEditedRoleTimeIds] = useState(() => new Set())
  const [tribunalEdited, setTribunalEdited] = useState(false)

  // 폼 첫 값이 바뀌면(다른 방·새 버전) 손댄 기록 지움 (렌더 중에 바로 맞춤)
  const [appliedFormSource, setAppliedFormSource] = useState({ key: formResetKey, state: initialFormState })
  if (appliedFormSource.key !== formResetKey || appliedFormSource.state !== initialFormState) {
    setAppliedFormSource({ key: formResetKey, state: initialFormState })
    setEditedRoleTimeIds(new Set())
    setTribunalEdited(false)
  }

  // 숫자 바꾸기 (패널의 setRange 대신 씀)
  const handleSetRange = (id, next) => {
    // 직업별 밤 시간을 실제로 바꿨으면 손댄 것으로 기억
    const changed = ranges[id] !== next
    if (NIGHT_TIME_ID_TO_ROLE[id] !== undefined && changed) {
      setEditedRoleTimeIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    }
    if (id === TRIBUNAL_TIME_ID && changed) setTribunalEdited(true)
    // 재판 시간은 안 건드렸고 낮 투표와 같으면 같이 바꿈 (처음엔 낮 투표 시간과 같은 값)
    if (id === DAY_VOTE_TIME_ID && changed && shouldTribunalFollowDayVote(ranges, tribunalEdited)) {
      setRange(TRIBUNAL_TIME_ID, next)
    }
    setRange(id, next)

    // 전체 밤 시간을 바꾸면 서버가 정하지 않고 손대지 않은 직업을 맞춤 (서버 목록 없는 새 방도, known 1-14)
    if (id !== OVERALL_NIGHT_ACTION_TIME_ID || !changed) return
    const serverSpecified = Array.isArray(initialFormState?.specifiedRoleNightActionTimes)
      ? initialFormState.specifiedRoleNightActionTimes
      : []
    for (const [roleTimeId, role] of Object.entries(NIGHT_TIME_ID_TO_ROLE)) {
      if (serverSpecified.includes(role) || editedRoleTimeIds.has(roleTimeId)) continue
      setRange(roleTimeId, next)
    }
  }

  return { editedRoleTimeIds, handleSetRange }
}
