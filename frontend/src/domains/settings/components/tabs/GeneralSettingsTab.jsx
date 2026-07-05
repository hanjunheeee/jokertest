/**
 * 일반 설정 탭.
 *
 * 사운드/그래픽/게임플레이처럼 전역 옵션에 가까운 설정 컨트롤을 모읍니다.
 */
import { useState } from "react"
import { GENERAL_SETTINGS, SETTING_ASSETS } from "../../constants/settingAssets.js"
import CheckBox from "@/shared/ui/CheckBox"
import Dropdown from "@/shared/ui/Dropdown"
import Stepper from "@/shared/ui/Stepper"

const ROW_CLASS =
  "flex shrink-0 items-center justify-between gap-[clamp(1rem,2.5vw,2rem)] border-b border-[#c4a574]/35 py-[clamp(0.35rem,0.85vh,0.5rem)] last:border-b-0"

const LABEL_CLASS =
  "min-w-0 flex-1 font-subheading text-[clamp(1.02rem,1.5vw,1.18rem)] font-bold leading-snug text-[#140c08]"

export default function GeneralSettingsTab() {
  // useState(초기값)은 [현재값, 값을 바꾸는 함수]를 반환하는 훅으로, setChecks 호출 시
  // 컴포넌트가 다시 렌더링되어 체크박스 화면이 최신 상태로 갱신됩니다.
  // 여기서는 함수를 초기값으로 넘겨서(lazy initializer) 최초 렌더링 시 한 번만 실행되도록 함
  // (매 렌더마다 다시 계산하지 않기 위함).
  // checks: 체크박스 항목 id -> 체크 여부(boolean)를 담은 객체. GENERAL_SETTINGS에서
  // type이 "checkbox"인 항목만 골라 defaultChecked 값으로 초기화함
  const [checks, setChecks] = useState(() =>
    Object.fromEntries(
      GENERAL_SETTINGS.filter((item) => item.type === "checkbox").map((item) => [
        item.id,
        item.defaultChecked,
      ]),
    ),
  )

  return (
    <div className="flex min-h-0 flex-col">
      {GENERAL_SETTINGS.map((item) => {
        if (item.type === "dropdown") {
          return (
            <div key={item.id} className={ROW_CLASS} data-setting-row>
              <span className={LABEL_CLASS}>{item.label}</span>
              <Dropdown
                value={item.value}
                inputFieldSrc={SETTING_ASSETS.inputField}
              />
            </div>
          )
        }
        if (item.type === "stepper") {
          return (
            <div key={item.id} className={ROW_CLASS} data-setting-row>
              <span className={LABEL_CLASS}>{item.label}</span>
              <Stepper
                ariaLabel={item.label}
                options={item.options}
                defaultIndex={item.defaultIndex}
                inputFieldSrc={SETTING_ASSETS.inputField}
                arrowSrc={SETTING_ASSETS.arrow}
              />
            </div>
          )
        }
        return (
          <div key={item.id} className={ROW_CLASS} data-setting-row>
            <span className={LABEL_CLASS}>{item.label}</span>
            <CheckBox
              ariaLabel={item.label}
              checked={checks[item.id]}
              // 체크 상태가 바뀔 때 CheckBox가 호출하는 콜백 — 해당 항목의 값만 갱신
              onChange={(next) =>
                setChecks((prev) => ({ ...prev, [item.id]: next }))
              }
              checkboxSrc={SETTING_ASSETS.checkbox}
              checkMarkSrc={SETTING_ASSETS.checkMark}
            />
          </div>
        )
      })}
    </div>
  )
}
