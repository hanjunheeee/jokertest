/**
 * 인게임 설정 — 방관리 탭 (방장 전용)
 *
 * F-24(AC-01/AC-04/AC-05): 이 탭의 두 항목은 더 이상 지역 상태에만 머무르지 않는다.
 *   - "다음 게임 동일 설정 유지"는 useNextRoomSettings를 통해 현재 계정의 영속 저장소로 간다.
 *   - "방 코드 복사"는 부모(SettingPanel)가 띄우는 실제 방코드 모달을 연다.
 */
import { INGAME_SETTING_ROOM_ROWS } from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { INGAME_SETTING_TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import { useNextRoomSettings } from "../../../hooks/useNextRoomSettings.js"
import SettingRoomRow from "./SettingRoomRow.jsx"

/** 안내·재시도 줄의 스타일. 행 아래에 붙어 실패 사유와 저장 범위를 함께 읽어 준다. */
const NOTICE_CLASS =
  "mt-[0.45rem] px-[0.6rem] text-left font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1vw,0.88rem)] leading-snug text-[#f0e0c8]/80"
const ERROR_CLASS = `${NOTICE_CLASS} text-[#ffb3a7]`
const RETRY_CLASS =
  "ml-[0.4rem] cursor-pointer border-0 bg-transparent p-0 underline decoration-dotted"

export default function SettingRoomTab({ onOpenKickPlayer, onOpenRoomCode }) {
  const {
    enabled, canToggle, canDisable, setKeepSettings, statusMessage, canRetry, retry, scopeNotice,
  } = useNextRoomSettings()

  const handleRoomAction = (rowId) => {
    if (rowId === "kick-player") {
      onOpenKickPlayer?.()
      return
    }
    if (rowId === "view-room-code") {
      onOpenRoomCode?.()
    }
  }

  return (
    <div className={INGAME_SETTING_TAB_BODY_CLASS}>
      {INGAME_SETTING_ROOM_ROWS.map((row) =>
        row.kind === "action" ? (
          <SettingRoomRow
            key={row.id}
            title={row.title}
            description={row.description}
            variant="action"
            actionLabel={row.actionLabel}
            actionTone={row.actionTone}
            onAction={() => handleRoomAction(row.id)}
          />
        ) : (
          <div key={row.id}>
            <SettingRoomRow
              title={row.title}
              description={row.description}
              variant="checkbox"
              // 체크 상태의 원천은 영속 저장소다 — 쓰기·재읽기 확인이 끝나야 켜진 것으로
              // 보인다. 화면만 먼저 켜 두면 실패한 저장이 성공처럼 보인다(A-11).
              checked={row.id === "keep-settings-next-game" ? enabled : row.defaultChecked}
              onChange={(next) => {
                if (row.id !== "keep-settings-next-game") return
                // 켜기와 끄기의 조건이 다르다(AC-05) — 원본이 없어도 **끄기**는 열어 둔다.
                if (next ? !canToggle : !canDisable) return
                setKeepSettings(next)
              }}
            />
            {row.id === "keep-settings-next-game" ? (
              <>
                {statusMessage ? (
                  <p role="alert" className={ERROR_CLASS}>
                    {statusMessage}
                    {canRetry ? (
                      <button type="button" className={RETRY_CLASS} onClick={retry}>
                        다시 시도
                      </button>
                    ) : null}
                  </p>
                ) : null}
                {/* 저장 범위(같은 브라우저·계정별)를 항상 보이게 둔다 — 다른 브라우저에서도
                    복원된다고 믿게 두지 않는다(A-08). */}
                <p className={NOTICE_CLASS}>{scopeNotice}</p>
              </>
            ) : null}
          </div>
        ),
      )}
    </div>
  )
}
