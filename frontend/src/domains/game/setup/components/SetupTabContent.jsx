/**
 * 설정 탭 본문 — constants 항목 배열을 checkbox·stepper 행으로 렌더
 * GeneralGameSetupTab·MeetingGameSetupTab에서 items만 바꿔 공통 사용
 *
 * props
 * - items: GENERAL_GAME_SETUP | MEETING_GAME_SETUP 형태 (type: checkbox | stepper)
 *
 * 각 항목 id별 checked·range 값은 이 컴포넌트 내부 state로만 관리 (API·상위 전달 없음)
 */
import { useMemo, useState } from "react"
import SetupCheckboxRow from "./rows/SetupCheckboxRow.jsx"
import SetupStepperRow from "./rows/SetupStepperRow.jsx"

const SETUP_LIST_GAP_CLASS =
  "flex min-h-0 flex-1 flex-col justify-start gap-[clamp(2rem,2.1vh,2.5rem)]"

/** items에서 checkbox defaultChecked·stepper defaultValue로 초기 state 객체 생성 */
function buildInitialState(items) {
  const checks = {}
  const ranges = {}

  for (const item of items) {
    if (item.type === "checkbox") checks[item.id] = item.defaultChecked
    if (item.type === "stepper") {
      ranges[item.id] = item.defaultValue
    }
  }

  return { checks, ranges }
}

/** items 목록을 타입에 맞는 행 컴포넌트로 map하며 로컬 state 갱신 */
export default function SetupTabContent({ items }) {
  const initial = useMemo(() => buildInitialState(items), [items])
  const [checks, setChecks] = useState(initial.checks)
  const [ranges, setRanges] = useState(initial.ranges)

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
              onChange={(next) =>
                setRanges((prev) => ({ ...prev, [item.id]: next }))
              }
            />
          )
        }

        // checkbox (stepper가 아닌 항목)
        return (
          <SetupCheckboxRow
            key={item.id}
            label={item.label}
            description={item.description}
            checked={checks[item.id]}
            onChange={(next) =>
              setChecks((prev) => ({ ...prev, [item.id]: next }))
            }
          />
        )
      })}
    </div>
  )
}
