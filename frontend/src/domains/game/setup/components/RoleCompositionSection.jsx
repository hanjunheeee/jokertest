/**
 * 역할 구성(자동 / 직접 지정) 설정 구역.
 *
 * 일반 탭 목록 아래에 붙는 controlled component다 — 상태는 상위(GameSetupPanel)의
 * useRoleCompositionState가 소유하고, 여기서는 표시와 입력 전달만 한다.
 * 행 스타일·에셋은 기존 설정 행(SetupStepperRow/SetupCheckboxRow)과 동일하게 쓴다.
 *
 * props
 * - mode: "auto" | "custom"
 * - onSelectMode: 모드 변경 콜백
 * - roleCounts: { JOKER, DOCTOR, GUARD, WITCH_HUNTER }
 * - onChangeRoleCount: (roleKey, next) => void
 * - maxPlayers: 현재 정원(파생 CITIZEN 수·검증 기준)
 * - citizenCount: 정원 기준 파생 시민 수(계산 불가면 null)
 * - fixedRoleCount: 지정한 고정 역할 인원 합
 * - validation: { ok } | { ok:false, message }
 */
import {
  CITIZEN_ROLE_LABEL,
  CUSTOM_ROLE_KEYS,
  CUSTOM_ROLE_LABELS,
  ROLE_COMPOSITION_MODE_OPTIONS,
  ROLE_COMPOSITION_MODES,
} from "../constants/roleComposition.js"
import { getRoleCountRange } from "../utils/roleComposition.js"
import SetupChoiceRow from "./rows/SetupChoiceRow.jsx"
import SetupStepperRow from "./rows/SetupStepperRow.jsx"

const MODE_OPTIONS = ROLE_COMPOSITION_MODE_OPTIONS.map(({ mode, label }) => ({ value: mode, label }))

const SUMMARY_CLASS =
  "flex shrink-0 flex-col items-center gap-[clamp(0.1rem,0.25vh,0.2rem)] border-b border-[#8b7355]/35 py-[clamp(0.15rem,0.32vh,0.26rem)] text-center last:border-b-0"

/** 합계·정원 등 파생 수치 한 줄 */
const SUMMARY_LINE_CLASS =
  "font-subheading text-[clamp(1.02rem,1.38vw,1.16rem)] font-bold leading-snug text-[#2a1810]"

/** 검증 실패 안내 — 양피지 테마 위에서 읽히도록 붉은 계열만 다르게 쓴다. */
const SUMMARY_ERROR_CLASS =
  "font-subheading text-[clamp(1.02rem,1.38vw,1.16rem)] font-bold leading-snug text-[#8c1c13]"

export default function RoleCompositionSection({
  mode,
  onSelectMode,
  roleCounts,
  onChangeRoleCount,
  maxPlayers,
  citizenCount,
  fixedRoleCount,
  validation,
}) {
  const isCustom = mode === ROLE_COMPOSITION_MODES.CUSTOM

  return (
    <div
      data-setup-role-composition
      className="flex flex-col gap-[clamp(2rem,2.1vh,2.5rem)]"
    >
      <SetupChoiceRow
        label="역할 구성"
        description="자동은 인원 수에 맞춰 서버가 특수 역할을 배정합니다. 직접 지정하면 역할별 인원을 방장이 정합니다."
        options={MODE_OPTIONS}
        value={mode}
        onChange={onSelectMode}
      />

      {isCustom ? (
        <>
          {CUSTOM_ROLE_KEYS.map((roleKey) => {
            const range = getRoleCountRange(roleKey, maxPlayers)
            return (
              <SetupStepperRow
                key={roleKey}
                label={`${CUSTOM_ROLE_LABELS[roleKey]} 인원`}
                value={roleCounts[roleKey]}
                min={range.min}
                max={range.max}
                unit="명"
                onChange={(next) => onChangeRoleCount(roleKey, next)}
              />
            )
          })}

          <div className={SUMMARY_CLASS} data-setup-role-composition-summary>
            <p className={SUMMARY_LINE_CLASS}>
              {/* CITIZEN은 입력 항목이 아니라 남은 자리에서 파생되는 값이다. */}
              {CITIZEN_ROLE_LABEL}: {citizenCount === null ? "-" : `${citizenCount}명`} (자동 계산)
            </p>
            <p className={SUMMARY_LINE_CLASS}>
              지정한 인원 합계: {Number.isInteger(fixedRoleCount) ? fixedRoleCount : "-"} / {maxPlayers}명
            </p>
            <p className={SUMMARY_LINE_CLASS}>
              시민 수는 게임 시작 시점의 실제 참가 인원에서 지정한 역할을 뺀 나머지로 정해집니다.
            </p>
            {validation.ok ? null : <p className={SUMMARY_ERROR_CLASS}>{validation.message}</p>}
          </div>
        </>
      ) : null}
    </div>
  )
}
