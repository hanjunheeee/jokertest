// 설정 일반 탭 (전체화면·텍스트 크기·알림 체크·튜토리얼 다시 보기·초기화)
// layout/SettingContent.jsx가 씀
import { useState } from "react"
import {
    GENERAL_SETTING_ACTIONS,
    GENERAL_SETTING_CHECKBOXES,
    GENERAL_SETTING_TEXT_SIZE,
    SETTING_SECTIONS,
} from "@/domains/settings/constants/generalSettings.js"
import { useSettingsStore } from "@/domains/settings/store/settingsStore.js"
import { useFullscreen } from "@/shared/hooks/useFullscreen.js"
import ActionRow from "../rows/ActionRow.jsx"
import SliderRow from "../rows/SliderRow.jsx"
import ToggleRow from "../rows/ToggleRow.jsx"
import TutorialSheet from "../tutorial/TutorialSheet.jsx"
import { SECTION_TITLE_CLASS } from "../../constants/settingStyles.js"

// 귓속말 줄은 데스크톱처럼 화면에서 뺌
const HIDDEN_NOTIFICATION_IDS = new Set(["whisper"])

// iPhone Safari는 요소 전체화면이 없음 → 줄 자체를 숨김
const FULLSCREEN_SUPPORTED = typeof document !== "undefined" && document.fullscreenEnabled === true

// 줄 목록은 데스크톱 상수 그대로, 값은 설정 스토어(전체화면만 브라우저 상태)
export default function GeneralTab() {
    const { isFullscreen, setFullscreen } = useFullscreen()
    const checks = useSettingsStore((s) => s.generalChecks)
    const setGeneralCheck = useSettingsStore((s) => s.setGeneralCheck)
    const textSize = useSettingsStore((s) => s.generalTextSize)
    const setGeneralTextSize = useSettingsStore((s) => s.setGeneralTextSize)
    const resetSettings = useSettingsStore((s) => s.resetSettings)
    const [tutorialOpen, setTutorialOpen] = useState(false)

    // 전체화면은 브라우저에 맡김(저장 안 함), 나머지는 스토어에 저장
    const toggle = (id, next) => (id === "fullscreen" ? void setFullscreen(next) : setGeneralCheck(id, next))
    const isChecked = (id) => (id === "fullscreen" ? isFullscreen : Boolean(checks[id]))

    // 튜토리얼은 시트 열기, 초기화는 스토어 기본값으로
    const runAction = (id) => {
        if (id === "replay-tutorial") setTutorialOpen(true)
        if (id === "reset-settings") resetSettings()
    }

    const screenItems = GENERAL_SETTING_CHECKBOXES.filter(
        ({ section, id }) => section === "screen" && (id !== "fullscreen" || FULLSCREEN_SUPPORTED),
    )
    const notificationItems = GENERAL_SETTING_CHECKBOXES.filter(
        ({ section, id }) => section === "notification" && !HIDDEN_NOTIFICATION_IDS.has(id),
    )

    const renderToggle = ({ id, label }) => (
        <ToggleRow key={id} label={label} checked={isChecked(id)} onChange={(next) => toggle(id, next)} />
    )

    return (
        <>
            <div className="flex flex-col">
                {/* 화면 모드: 전체화면 + 텍스트 크기 (바꾸면 바로 글자 배율이 따라감) */}
                <h3 className={SECTION_TITLE_CLASS}>{SETTING_SECTIONS.screen}</h3>
                {screenItems.map(renderToggle)}
                <SliderRow
                    label={GENERAL_SETTING_TEXT_SIZE.label}
                    min={GENERAL_SETTING_TEXT_SIZE.min}
                    max={GENERAL_SETTING_TEXT_SIZE.max}
                    value={textSize}
                    onChange={setGeneralTextSize}
                />

                <h3 className={SECTION_TITLE_CLASS}>{SETTING_SECTIONS.notification}</h3>
                {notificationItems.map(renderToggle)}

                {/* 알림과 동작 버튼 사이 빈 칸 */}
                <div className="h-5 shrink-0" aria-hidden="true" />
                {GENERAL_SETTING_ACTIONS.map(({ id, label, buttonLabel }) => (
                    <ActionRow key={id} label={label} buttonLabel={buttonLabel} onClick={() => runAction(id)} />
                ))}
            </div>

            <TutorialSheet open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
        </>
    )
}
