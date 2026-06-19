/**
 * 설정 탭 본문.
 *
 * items 배열(constants)을 checkbox·stepper 행으로 렌더합니다.
 * 폼 상태(checks·ranges) 관리는 useSetupTabState에 위임합니다.
 * GeneralGameSetupTab·MeetingGameSetupTab에서 items만 바꿔 공통으로 사용합니다.
 *
 * props
 * - items: GENERAL_GAME_SETUP | MEETING_GAME_SETUP 형태 (type: "checkbox" | "stepper")
 */
import SetupCheckboxRow from "./rows/SetupCheckboxRow.jsx"
import SetupStepperRow from "./rows/SetupStepperRow.jsx"
import { useSetupTabState } from "../hooks/useSetupTabState.js"

const SETUP_LIST_GAP_CLASS =
  "flex min-h-0 flex-1 flex-col justify-start gap-[clamp(2rem,2.1vh,2.5rem)]"

export default function SetupTabContent({ items }) {
  // checks: { [id]: boolean }, ranges: { [id]: number } — items에서 초기값 파생
  const { checks, ranges, setCheck, setRange } = useSetupTabState(items)

  return (
    <div className={SETUP_LIST_GAP_CLASS}>
      {items.map((item) => {
        if (item.type === "stepper") {
          return (
            <SetupStepperRow
              key={item.id}
              label={item.label}
              description={item.description}
              value={ranges[item.id]} // 현재 스테퍼 값
              min={item.min}
              max={item.max}
              step={item.step}
              unit={item.unit}
              onChange={(next) => setRange(item.id, next)} // ranges 부분 업데이트
            />
          )
        }

        return (
          <SetupCheckboxRow
            key={item.id}
            label={item.label}
            description={item.description}
            checked={checks[item.id]} // 현재 체크박스 ON/OFF
            onChange={(next) => setCheck(item.id, next)} // checks 부분 업데이트
          />
        )
      })}
    </div>
  )
}
