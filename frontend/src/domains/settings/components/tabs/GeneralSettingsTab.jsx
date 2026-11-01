// 설정 일반 탭 (전체화면·글자 크기·알림 체크·튜토리얼 다시 보기·초기화)
// components/SettingContentArea.jsx가 씀
import { useState } from "react"
import TutorialGuideOverlay from "@/shared/ui/tutorialGuide/TutorialGuideOverlay.jsx"
import {
  GENERAL_SETTING_ACTIONS,
  GENERAL_SETTING_CHECKBOXES,
  SETTING_SECTIONS,
  GENERAL_SETTING_TEXT_SIZE,
} from "../../constants/generalSettings.js"
import { SETTING_ASSETS } from "../../constants/settingAssets.js"
import CheckBox from "@/shared/ui/CheckBox"
import PublicAsset from "@/shared/ui/PublicAsset"
import RangeSlider from "@/shared/ui/RangeSlider"
import { useFullscreen } from "@/shared/hooks/useFullscreen.js"
import { useSettingsStore } from "../../store/settingsStore.js"

// 귓속말 알림 줄은 화면에서 뺌 (기본값·저장에서도 빠짐)
const HIDDEN_NOTIFICATION_IDS = new Set(["whisper"])

// 줄·구역 제목·이름·동작 버튼 모양
const ROW_CLASS =
  "flex shrink-0 items-center justify-between gap-[clamp(1rem,2.5vw,2rem)] border-b border-[#c4a574]/35 py-[clamp(0.35rem,0.85vh,0.5rem)]"

const SECTION_TITLE_CLASS =
  "shrink-0 pt-[clamp(0.45rem,1vh,0.65rem)] font-subheading app-text-scaled [--app-text-size:clamp(0.88rem,1.15vw,1rem)] font-black tracking-wide text-[#3d2a1c]/72 first:pt-0"

const LABEL_CLASS =
  "min-w-0 flex-1 font-subheading app-text-scaled [--app-text-size:clamp(1.02rem,1.5vw,1.18rem)] font-bold leading-snug text-[#140c08]"

const ACTION_BTN_CLASS =
  "interactive-scale relative block w-[clamp(7.1rem,15vw,9.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

const ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[0.35rem] text-center font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1vw,0.88rem)] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 버튼 그림 위에 글자 겹친 동작 버튼
function SettingActionButton({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} className={ACTION_BTN_CLASS}>
      <PublicAsset
        src={SETTING_ASSETS.actionButton}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className={ACTION_BTN_LABEL_CLASS}>{label}</span>
    </button>
  )
}

// 이름 + 체크 상자 한 줄 (data-setting-row는 스크롤바 길이 재기용)
function SettingCheckboxRow({ label, checked, onChange }) {
  return (
    <div className={ROW_CLASS} data-setting-row>
      <span className={LABEL_CLASS}>{label}</span>
      <CheckBox
        ariaLabel={label}
        checked={checked}
        onChange={onChange}
        checkboxSrc={SETTING_ASSETS.checkbox}
        checkMarkSrc={SETTING_ASSETS.checkMark}
      />
    </div>
  )
}

// 전체화면은 브라우저 상태, 나머지는 설정 스토어 값
export default function GeneralSettingsTab() {
  const { isFullscreen, setFullscreen } = useFullscreen()
  const checks = useSettingsStore((s) => s.generalChecks)
  const setGeneralCheck = useSettingsStore((s) => s.setGeneralCheck)
  const textSize = useSettingsStore((s) => s.generalTextSize)
  const setGeneralTextSize = useSettingsStore((s) => s.setGeneralTextSize)
  const resetSettings = useSettingsStore((s) => s.resetSettings)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  // 튜토리얼은 창 열기, 초기화는 스토어 기본값으로
  const handleActionClick = (id) => {
    if (id === "replay-tutorial") {
      setTutorialOpen(true)
      return
    }
    if (id === "reset-settings") {
      resetSettings()
    }
  }

  // 전체화면은 브라우저에 맡김(저장 안 함), 나머지는 스토어에 저장
  const handleCheckboxChange = (id, next) => {
    if (id === "fullscreen") {
      void setFullscreen(next)
      return
    }
    setGeneralCheck(id, next)
  }

  // 전체화면 체크는 실제 브라우저 상태로 보임
  const isChecked = (id) => (id === "fullscreen" ? isFullscreen : Boolean(checks[id]))

  // 화면·알림 구역 나누기 (숨긴 알림 뺌)
  const screenItems = GENERAL_SETTING_CHECKBOXES.filter(({ section }) => section === "screen")
  const notificationItems = GENERAL_SETTING_CHECKBOXES.filter(
    ({ section, id }) => section === "notification" && !HIDDEN_NOTIFICATION_IDS.has(id),
  )

  return (
    <>
      <div className="flex min-h-0 flex-col pb-[clamp(0.35rem,0.85vh,0.5rem)]">
      {/* 화면 모드: 전체화면 + 글자 크기 */}
      <h3 className={SECTION_TITLE_CLASS}>{SETTING_SECTIONS.screen}</h3>
      {screenItems.map(({ id, label }) => (
        <SettingCheckboxRow
          key={id}
          label={label}
          checked={isChecked(id)}
          onChange={(next) => handleCheckboxChange(id, next)}
        />
      ))}

      {/* 글자 크기 슬라이더: 바꾸면 인게임 밖 글자 크기가 따라감 */}
      <div className={ROW_CLASS} data-setting-row>
        <span className={LABEL_CLASS}>{GENERAL_SETTING_TEXT_SIZE.label}</span>
        <RangeSlider
          ariaLabel={GENERAL_SETTING_TEXT_SIZE.label}
          min={GENERAL_SETTING_TEXT_SIZE.min}
          max={GENERAL_SETTING_TEXT_SIZE.max}
          value={textSize}
          onChange={setGeneralTextSize}
        />
      </div>

      {/* 알림 받기 체크 */}
      <h3 className={SECTION_TITLE_CLASS}>{SETTING_SECTIONS.notification}</h3>
      {notificationItems.map(({ id, label }) => (
        <SettingCheckboxRow
          key={id}
          label={label}
          checked={isChecked(id)}
          onChange={(next) => handleCheckboxChange(id, next)}
        />
      ))}

      {/* 알림과 동작 버튼 사이 빈 칸 */}
      <div
        className="shrink-0 h-[clamp(1.25rem,2.4vh,1.65rem)]"
        aria-hidden="true"
      />

      {/* 튜토리얼 다시 보기·설정 초기화 줄 */}
      {GENERAL_SETTING_ACTIONS.map(({ id, label, buttonLabel }) => (
        <div key={id} className={`${ROW_CLASS} last:border-b-0`} data-setting-row>
          <span className={LABEL_CLASS}>{label}</span>
          <SettingActionButton
            label={buttonLabel}
            onClick={() => handleActionClick(id)}
          />
        </div>
      ))}
      </div>

      {/* 튜토리얼 창 (닫으면 열림 상태만 끔) */}
      <TutorialGuideOverlay open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </>
  )
}
