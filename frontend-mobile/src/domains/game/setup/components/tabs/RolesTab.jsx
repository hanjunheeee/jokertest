// 역할 배정 탭: 자동/직접 지정 고르기, 직접이면 역할별 인원 줄 + 시민 수 요약·오류
// SetupPanel이 씀 (데스크톱은 일반 탭 아래에 붙어 있던 구역)
import {
  CITIZEN_ROLE_LABEL,
  CUSTOM_ROLE_KEYS,
  CUSTOM_ROLE_LABELS,
  ROLE_COMPOSITION_MODE_OPTIONS,
} from "@/domains/game/setup/constants/roleComposition.js"
import { getRoleCountRange } from "@/domains/game/setup/utils/roleComposition.js"
import ChoiceRow from "../rows/ChoiceRow.jsx"
import StepperRow from "../rows/StepperRow.jsx"

const MODE_OPTIONS = ROLE_COMPOSITION_MODE_OPTIONS.map(({ mode, label }) => ({ value: mode, label }))

const LINE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:0.9rem] font-bold leading-snug text-[#2a1810]"

// 역할 구성 (roleComposition은 desktop useRoleCompositionState 결과 그대로)
export default function RolesTab({ roleComposition, maxPlayers }) {
  const { mode, selectMode, roleCounts, setRoleCount, citizenCount, fixedRoleCount, validation, isCustom } =
    roleComposition

  return (
    <div className="flex flex-col" data-setup-role-composition>
      <ChoiceRow
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
        <div className="flex flex-col gap-1 py-3 text-center" data-setup-role-composition-summary>
          <p className={LINE_CLASS}>
            {CITIZEN_ROLE_LABEL}: {citizenCount === null ? "-" : `${citizenCount}명`} (자동 계산)
          </p>
          <p className={LINE_CLASS}>
            지정한 인원 합계: {Number.isInteger(fixedRoleCount) ? fixedRoleCount : "-"} / {maxPlayers}명
          </p>
          <p className={`${LINE_CLASS} font-normal`}>
            시민 수는 게임 시작 시점의 실제 참가 인원에서 지정한 역할을 뺀 나머지로 정해집니다.
          </p>
          {validation.ok ? null : (
            <p role="alert" className={`${LINE_CLASS} text-[#8c1c13]`}>
              {validation.message}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
