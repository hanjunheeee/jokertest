/**
 * 플레이어 추방 모달 — 플레이어 1명 + 추방 버튼
 */
import {
  INGAME_KICK_PLAYER_ACTION_BTN_CLASS,
  INGAME_KICK_PLAYER_NAME_CLASS,
  INGAME_KICK_PLAYER_PROFILE_PHOTO_WRAP_CLASS,
  INGAME_KICK_PLAYER_PROFILE_WRAP_CLASS,
  INGAME_KICK_PLAYER_ROW_CLASS,
  INGAME_KICK_PLAYER_ROW_INNER_CLASS,
} from "../../../../constants/controls/ingameSetting/kickPlayer/ingameKickPlayerLayout.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "../../../../constants/controls/ingameSetting/kickPlayer/ingameKickPlayerData.js"
import { INGAME_PLAYER_THEME_TEXT_RENDER_CLASS } from "../../../../constants/ingamePlayerTheme.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"

/**
 * F-21(AC-02): themeStyles를 **props로** 받는다. 예전에는 이 행이 직접
 * useInGamePlayerSessionContext를 호출했는데, 그 컨텍스트가 없으면 훅이 던지므로 같은 모달을
 * 대기방에서 재사용할 수 없었다(대기방에는 InGamePlayerSessionProvider가 없다). 색을 아는
 * 것은 화면이고, 이 행은 주어진 값을 그리기만 한다.
 *
 * disabled는 전송 중을 뜻한다 — 연속 클릭이 두 번째 요청을 만들지 않게 하는 마지막 방어이며,
 * 서버의 영수증 계약이 그 위에서 다시 막는다.
 */
export default function SettingKickPlayerRow({
  playerId,
  name,
  profilePhotoSrc,
  profileBorderSrc,
  isPending = false,
  disabled = false,
  themeStyles = null,
  onKick,
}) {
  const nameStyle = themeStyles ? { color: themeStyles.color } : undefined
  const nameClass =
    `${INGAME_KICK_PLAYER_NAME_CLASS} ${themeStyles ? INGAME_PLAYER_THEME_TEXT_RENDER_CLASS : ""}`.trim()

  return (
    <li className={INGAME_KICK_PLAYER_ROW_CLASS}>
      <div className={INGAME_KICK_PLAYER_ROW_INNER_CLASS}>
        <PlayerProfilePortrait
          photoSrc={profilePhotoSrc}
          frameSrc={profileBorderSrc}
          wrapClassName={INGAME_KICK_PLAYER_PROFILE_WRAP_CLASS}
          photoWrapClassName={INGAME_KICK_PLAYER_PROFILE_PHOTO_WRAP_CLASS}
        />

        <p className={nameClass} style={nameStyle}>
          {name}
        </p>

        <button
          type="button"
          aria-label={
            isPending
              ? INGAME_KICK_PLAYER_MODAL_COPY.pendingAriaLabel
              : INGAME_KICK_PLAYER_MODAL_COPY.kickActionLabel
          }
          onClick={onKick}
          disabled={disabled}
          className={INGAME_KICK_PLAYER_ACTION_BTN_CLASS}
          style={{ outline: "none" }}
        >
          {isPending ? INGAME_KICK_PLAYER_MODAL_COPY.pendingLabel : INGAME_KICK_PLAYER_MODAL_COPY.kickActionLabel}
        </button>
      </div>
    </li>
  )
}
