import AuthInputSlot from "@/domains/auth/components/AuthInputSlot.jsx"
import {
  ACCOUNT_PANEL_ACTION_ROW_CLASS,
  ACCOUNT_PANEL_DIVIDER_SECTION_CLASS,
  ACCOUNT_PANEL_FORM_CLASS,
  ACCOUNT_PANEL_HEADING_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import ConfirmButton from "@/domains/user/components/AccountPanel/ConfirmButton.jsx"
import FeedbackMsg from "@/domains/user/components/AccountPanel/FeedbackMsg.jsx"
import UserIcon from "@/domains/user/components/AccountPanel/UserIcon.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 닉네임 변경 입력칸과 제출 버튼을 묶은 섹션입니다.
export default function NicknameSection({ nickname, setNickname, nicknameMsg, nicknameLoading, onSubmit }) {
  // F-16(AC-01): 확인음의 단일 소유자는 이 form submit이다 — ConfirmButton은 type="submit"이라
  // generic capture에서 제외되므로 클릭·Enter 어느 쪽이든 소리는 한 번이다. 요청 중
  // (nicknameLoading)에는 버튼이 disabled라 submit 자체가 일어나지 않지만, 핸들러가 없는
  // 경우에도 소리를 내지 않도록 여기서 한 번 더 막는다. 기존 입력 검증은 onSubmit의 몫이다.
  const handleSubmit = (event) => {
    if (typeof onSubmit !== "function") return
    dispatchUiSfx("ui-confirm", event)
    onSubmit(event)
  }

  return (
    <section className={ACCOUNT_PANEL_DIVIDER_SECTION_CLASS}>
      <h3 className={ACCOUNT_PANEL_HEADING_CLASS}>닉네임 변경</h3>

      <form onSubmit={handleSubmit} className={ACCOUNT_PANEL_FORM_CLASS}>
        {/* 새 닉네임을 입력하는 칸입니다. */}
        <AuthInputSlot
          name="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="새 닉네임"
          autoComplete="off"
          leadingIcon={<UserIcon />}
        />

        <div className={ACCOUNT_PANEL_ACTION_ROW_CLASS}>
          {/* 변경 성공/실패 메시지입니다. */}
          <FeedbackMsg msg={nicknameMsg} />

          {/* 요청 중에는 중복 클릭을 막기 위해 버튼을 비활성화합니다. */}
          <ConfirmButton label="변경" disabled={nicknameLoading} />
        </div>
      </form>
    </section>
  )
}
