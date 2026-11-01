// 역할 구성 구역: 자동/직접 지정 고르기 + 직접 지정이면 역할별 인원 줄·요약·오류
// SettingsItemList(일반 탭)가 씀, 글·범위 계산은 데스크톱 RoleCompositionSection과 같음
import { useEffect, useRef } from "react"
import {
  CITIZEN_ROLE_LABEL,
  CUSTOM_ROLE_KEYS,
  CUSTOM_ROLE_LABELS,
  ROLE_COMPOSITION_MODE_OPTIONS,
} from "@/domains/game/setup/constants/roleComposition.js"
import { getRoleCountRange } from "@/domains/game/setup/utils/roleComposition.js"
import Stepper from "./Stepper.jsx"
import SettingRow from "./SettingRow.jsx"
import StepperRow from "./StepperRow.jsx"
import { ERROR_ON_PARCHMENT_CLASS } from "../../constants/matchingMobileStyles.js"

const SUMMARY_CLASS =
  "font-subheading app-text-scaled [--app-text-size:0.85rem] font-bold leading-snug text-[#2a1810]"

// 역할 구성 구역 (roleComposition = useRoleCompositionState 값)
export default function RoleCompositionBlock({ roleComposition, maxPlayers }) {
  const { mode, selectMode, roleCounts, setRoleCount, isCustom, citizenCount, fixedRoleCount, validation } = roleComposition
  const index = Math.max(0, ROLE_COMPOSITION_MODE_OPTIONS.findIndex((option) => option.mode === mode))
  const blockRef = useRef(null)
  const prevModeRef = useRef(mode)

  // 직접 지정으로 바꾸면 늘어난 줄이 보이게 스크롤 (데스크톱은 DOM 훅이 맡음, 첫 그림엔 안 함)
  useEffect(() => {
    if (prevModeRef.current === mode) return
    prevModeRef.current = mode
    if (isCustom) blockRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [mode, isCustom])

  return (
    <div ref={blockRef} data-setup-role-composition>
      <SettingRow
        label="역할 구성"
        description="자동은 인원 수에 맞춰 서버가 특수 역할을 배정합니다. 직접 지정하면 역할별 인원을 방장이 정합니다."
      >
        <Stepper
          options={ROLE_COMPOSITION_MODE_OPTIONS.map((option) => option.label)}
          index={index}
          onIndexChange={(next) => selectMode(ROLE_COMPOSITION_MODE_OPTIONS[next].mode)}
          ariaLabel="역할 구성"
          valueWidthClass="w-[5.75rem]"
        />
      </SettingRow>

      {isCustom ? (
        <>
          {CUSTOM_ROLE_KEYS.map((roleKey) => {
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
          })}

          <div className="flex flex-col gap-1 py-2 text-center" data-setup-role-composition-summary>
            <p className={SUMMARY_CLASS}>
              {CITIZEN_ROLE_LABEL}: {citizenCount === null ? "-" : `${citizenCount}명`} (자동 계산)
            </p>
            <p className={SUMMARY_CLASS}>
              지정한 인원 합계: {Number.isInteger(fixedRoleCount) ? fixedRoleCount : "-"} / {maxPlayers}명
            </p>
            <p className={SUMMARY_CLASS}>
              시민 수는 게임 시작 시점의 실제 참가 인원에서 지정한 역할을 뺀 나머지로 정해집니다.
            </p>
            {validation.ok ? null : <p role="alert" className={ERROR_ON_PARCHMENT_CLASS}>{validation.message}</p>}
          </div>
        </>
      ) : null}
    </div>
  )
}
