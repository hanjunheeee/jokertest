// 설정 시트 방관리 탭(방장만): 다음 게임 설정 유지 줄 (인게임 추방은 기능 제거)
// SettingsBody가 씀, 유지 값은 데스크톱 useNextRoomSettings (SettingRoomTab과 같은 규칙)
import { INGAME_SETTING_ROOM_ROWS } from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js"
import { useNextRoomSettings } from "@/domains/game/ingame/hooks/useNextRoomSettings.js"
import RoomRow from "./RoomRow.jsx"
import { ERROR_CLASS, NOTICE_CLASS, RETRY_CLASS, TAB_BODY_CLASS } from "./rowStyle.js"

const KEEP_ROW_ID = "keep-settings-next-game"

// 체크 줄만 그림: 링크 줄은 인게임 추방뿐이었음 (데스크톱 줄 목록에 남아 있어도)
const ROOM_ROWS = INGAME_SETTING_ROOM_ROWS.filter((row) => row.kind === "checkbox")

// 줄 목록은 ingameSettingData의 방관리 줄을 순서대로 그림
export default function RoomTab() {
  const { enabled, canToggle, canDisable, setKeepSettings, statusMessage, canRetry, retry } =
    useNextRoomSettings()

  // 체크 줄은 설정 유지 줄만 진짜 값, 지금 켜기·끄기 못 하면 무시
  const handleKeepChange = (rowId, next) => {
    if (rowId !== KEEP_ROW_ID) return
    if (next ? !canToggle : !canDisable) return
    setKeepSettings(next)
  }

  return (
    <div className={TAB_BODY_CLASS}>
      {ROOM_ROWS.map((row) => (
        <div key={row.id} className="flex flex-col gap-1">
          <RoomRow
            title={row.title}
            description={row.description}
            variant="checkbox"
            checked={row.id === KEEP_ROW_ID ? enabled : row.defaultChecked}
            onChange={(next) => handleKeepChange(row.id, next)}
          />
          {/* 유지 줄 아래 안내·오류 글, 저장 실패(다시 시도 있음)만 경고 모양, 나머지는 안내 모양 (데스크톱과 같음) */}
          {row.id === KEEP_ROW_ID && statusMessage ? (
            <p role={canRetry ? "alert" : "status"} className={canRetry ? ERROR_CLASS : NOTICE_CLASS}>
              {statusMessage}
              {canRetry ? (
                <button type="button" className={RETRY_CLASS} onClick={retry}>다시 시도</button>
              ) : null}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
