// 설정 시트 방관리 탭(방장만): 플레이어 추방 줄과 다음 게임 설정 유지 줄
// SettingsBody가 씀, 유지 값은 데스크톱 useNextRoomSettings (SettingRoomTab과 같은 규칙)
import { INGAME_SETTING_ROOM_ROWS } from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js"
import { useNextRoomSettings } from "@/domains/game/ingame/hooks/useNextRoomSettings.js"
import RoomRow from "./RoomRow.jsx"
import { ERROR_CLASS, RETRY_CLASS, TAB_BODY_CLASS } from "./rowStyle.js"

const KEEP_ROW_ID = "keep-settings-next-game"

// 줄 목록은 ingameSettingData의 방관리 줄을 순서대로 그림
export default function RoomTab({ onOpenKickPlayer }) {
  const { enabled, canToggle, canDisable, setKeepSettings, statusMessage, canRetry, retry } =
    useNextRoomSettings()

  // 링크 줄 누름: 추방 줄이면 추방 시트 열기
  const handleRoomAction = (rowId) => {
    if (rowId === "kick-player") onOpenKickPlayer?.()
  }

  // 체크 줄은 설정 유지 줄만 진짜 값, 지금 켜기·끄기 못 하면 무시
  const handleKeepChange = (rowId, next) => {
    if (rowId !== KEEP_ROW_ID) return
    if (next ? !canToggle : !canDisable) return
    setKeepSettings(next)
  }

  return (
    <div className={TAB_BODY_CLASS}>
      {INGAME_SETTING_ROOM_ROWS.map((row) =>
        row.kind === "action" ? (
          <RoomRow
            key={row.id}
            title={row.title}
            description={row.description}
            variant="action"
            actionLabel={row.actionLabel}
            actionTone={row.actionTone}
            onAction={() => handleRoomAction(row.id)}
          />
        ) : (
          <div key={row.id} className="flex flex-col gap-1">
            <RoomRow
              title={row.title}
              description={row.description}
              variant="checkbox"
              checked={row.id === KEEP_ROW_ID ? enabled : row.defaultChecked}
              onChange={(next) => handleKeepChange(row.id, next)}
            />
            {/* 유지 줄 아래 안내·오류 글, 저장 실패일 때만 다시 시도 버튼 */}
            {row.id === KEEP_ROW_ID && statusMessage ? (
              <p role="alert" className={ERROR_CLASS}>
                {statusMessage}
                {canRetry ? (
                  <button type="button" className={RETRY_CLASS} onClick={retry}>다시 시도</button>
                ) : null}
              </p>
            ) : null}
          </div>
        ),
      )}
    </div>
  )
}
