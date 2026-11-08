// 설정 창 방관리 탭: 다음 게임 설정 유지 줄 (판 안 추방 줄은 기능을 빼며 지움)
// 설정 창 내용(SettingPanelContent)이 사용, 유지 값은 useNextRoomSettings
import { INGAME_SETTING_ROOM_ROWS } from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import { useNextRoomSettings } from "../../../hooks/useNextRoomSettings.js"
import SettingRoomRow from "./SettingRoomRow.jsx"

// 설정 유지 줄 아래 안내·오류 글과 다시 시도 버튼 모양
const NOTICE_CLASS =
  "mt-[0.45rem] px-[0.6rem] text-left font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1vw,0.88rem)] leading-snug text-[#f0e0c8]/80"
const ERROR_CLASS = `${NOTICE_CLASS} text-[#ffb3a7]`
const RETRY_CLASS =
  "ml-[0.4rem] cursor-pointer border-0 bg-transparent p-0 underline decoration-dotted"

// 줄 목록은 ingameSettingData의 방관리 줄(체크 줄)을 순서대로 그림
export default function SettingRoomTab() {
  const {
    enabled, canToggle, canDisable, setKeepSettings, statusMessage, canRetry, retry,
  } = useNextRoomSettings()

  // 체크 줄은 설정 유지 줄만 진짜 값을 씀, 지금 켜기·끄기 못 하면 무시
  // 유지 줄 아래 안내·오류 글, 저장 실패일 때만 다시 시도 버튼
  return (
    <div className={TAB_BODY_CLASS}>
      {INGAME_SETTING_ROOM_ROWS.map((row) => (
          <div key={row.id}>
            <SettingRoomRow
              title={row.title}
              description={row.description}
              variant="checkbox"
              checked={row.id === "keep-settings-next-game" ? enabled : row.defaultChecked}
              onChange={(next) => {
                if (row.id !== "keep-settings-next-game") return
                if (next ? !canToggle : !canDisable) return
                setKeepSettings(next)
              }}
            />
            {row.id === "keep-settings-next-game" ? (
              <>
                {/* 저장·해제 실패만 붉은 오류·바로 알림, 불러오는 중 같은 안내는 보통 글 */}
                {statusMessage ? (
                  <p role={canRetry ? "alert" : "status"} className={canRetry ? ERROR_CLASS : NOTICE_CLASS}>
                    {statusMessage}
                    {canRetry ? (
                      <button type="button" className={RETRY_CLASS} onClick={retry}>
                        다시 시도
                      </button>
                    ) : null}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
      ))}
    </div>
  )
}
