/**
 * 설정 탭 본문.
 *
 * items 배열(constants)을 checkbox·stepper 행으로 렌더합니다.
 * 폼 상태(checks·ranges)는 상위(GameSetupPanel)가 소유하며, 이 컴포넌트는 표시와
 * 입력 전달만 담당하는 controlled component입니다.
 *
 * props
 * - items: GENERAL_GAME_SETUP | MEETING_GAME_SETUP 형태 (type: "checkbox" | "stepper")
 * - checks, ranges: 상위가 소유한 전체 설정 상태(다른 탭의 값도 포함되어 있을 수 있음)
 * - setCheck, setRange: 값 변경 콜백
 */
import SetupCheckboxRow from "./rows/SetupCheckboxRow.jsx"
import SetupStepperRow from "./rows/SetupStepperRow.jsx"

const SETUP_LIST_GAP_CLASS =
  "flex min-h-0 flex-1 flex-col justify-start gap-[clamp(2rem,2.1vh,2.5rem)]"

export default function SetupTabContent({ items, checks, ranges, setCheck, setRange }) {
  return (
    <div className={SETUP_LIST_GAP_CLASS}>
      {items.map((item) => {
        if (item.type === "stepper") {
          return (
            <SetupStepperRow
              key={item.id}
              label={item.label}
              description={item.description}
              value={ranges[item.id]}
              min={item.min}
              max={item.max}
              step={item.step}
              unit={item.unit}
              onChange={(next) => setRange(item.id, next)}
            />
          )
        }

        return (
          <SetupCheckboxRow
            key={item.id}
            label={item.label}
            description={item.description}
            checked={checks[item.id]}
            onChange={(next) => setCheck(item.id, next)}
          />
        )
      })}
    </div>
  )
}
