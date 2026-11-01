// 역할 구성 구역: 자동/직접 지정 고르기 + 직접 지정이면 역할별 인원 줄·시민 수 요약·오류
// 방 설정 역할 배정 탭·대기방 설정 변경 시트(일반 탭 아래)가 씀, 글·범위 계산은 데스크톱 RoleCompositionSection과 같음
import { useEffect, useRef } from "react"
import {
  CITIZEN_ROLE_LABEL,
  CUSTOM_ROLE_KEYS,
  CUSTOM_ROLE_LABELS,
  ROLE_COMPOSITION_MODE_OPTIONS,
} from "@/domains/game/setup/constants/roleComposition.js"
import { getRoleCountRange } from "@/domains/game/setup/utils/roleComposition.js"
import { SETTING_LOOKS } from "./settingLooks.js"
import ChoiceRow from "./ChoiceRow.jsx"
import StepperRow from "./StepperRow.jsx"

const MODE_OPTIONS = ROLE_COMPOSITION_MODE_OPTIONS.map(({ mode, label }) => ({ value: mode, label }))

// roleComposition = 데스크톱 useRoleCompositionState 결과 그대로
export default function RoleComposition({ look: lookName, roleComposition, maxPlayers }) {
  const { mode, selectMode, roleCounts, setRoleCount, citizenCount, fixedRoleCount, validation, isCustom } =
    roleComposition
  const role = SETTING_LOOKS[lookName].role
  const blockRef = useRef(null)
  const summaryRef = useRef(null)
  const prevModeRef = useRef(mode)

  // 직접 지정으로 바꾸면 늘어난 줄이 보이게 스크롤 (첫 그림엔 안 함), 방 설정은 데스크톱처럼 요약 줄까지
  useEffect(() => {
    if (prevModeRef.current === mode) return
    prevModeRef.current = mode
    if (!role.scrollOnCustom || !isCustom) return
    const target = role.scrollToSummary ? summaryRef.current : blockRef.current
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [mode, isCustom, role.scrollOnCustom, role.scrollToSummary])

  return (
    <div ref={blockRef} className={role.wrap} data-setup-role-composition>
      <ChoiceRow
        look={lookName}
        label="역할 구성"
        description="자동은 인원 수에 맞춰 서버가 특수 역할을 배정합니다. 직접 지정하면 역할별 인원을 방장이 정합니다."
        options={MODE_OPTIONS}
        value={mode}
        onChange={selectMode}
      />

      {isCustom
        ? CUSTOM_ROLE_KEYS.map((roleKey) => {
            const range = getRoleCountRange(roleKey, maxPlayers)
            return (
              <StepperRow
                key={roleKey}
                look={lookName}
                label={`${CUSTOM_ROLE_LABELS[roleKey]} 인원`}
                value={roleCounts[roleKey]}
                min={range.min}
                max={range.max}
                unit="명"
                onChange={(next) => setRoleCount(roleKey, next)}
              />
            )
          })
        : null}

      {isCustom ? (
        <div ref={summaryRef} className={role.summary} data-setup-role-composition-summary>
          <p className={role.line}>
            {CITIZEN_ROLE_LABEL}: {citizenCount === null ? "-" : `${citizenCount}명`} (자동 계산)
          </p>
          <p className={role.line}>
            지정한 인원 합계: {Number.isInteger(fixedRoleCount) ? fixedRoleCount : "-"} / {maxPlayers}명
          </p>
          <p className={`${role.line} ${role.note}`}>
            시민 수는 게임 시작 시점의 실제 참가 인원에서 지정한 역할을 뺀 나머지로 정해집니다.
          </p>
          {validation.ok ? null : (
            <p role="alert" className={`${role.line} ${role.error}`}>
              {validation.message}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
