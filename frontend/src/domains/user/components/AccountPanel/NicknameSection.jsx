// 닉네임 바꾸기 칸 (입력 + 결과 문구 + 변경 버튼)
// AccountPanel이 씀
import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"
import {
  DIVIDER_SECTION_CLASS,
  PANEL_FORM_CLASS,
  PANEL_FORM_HEADING_CLASS,
  INPUT_WRAP_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import AccountPanelFormActions from "@/domains/user/components/AccountPanel/AccountPanelFormActions.jsx"
import UserIcon from "@/domains/user/components/AccountPanel/UserIcon.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 보낼 때 확인 소리를 내고 폼 처리로 넘김, 보내는 중엔 버튼 잠금
export default function NicknameSection({ nickname, setNickname, nicknameMsg, nicknameLoading, onSubmit }) {
  const handleSubmit = (event) => {
    // 처리 함수가 없으면 아무것도 안 함
    if (typeof onSubmit !== "function") return
    dispatchUiSfx("ui-confirm", event)
    onSubmit(event)
  }

  return (
    <section className={DIVIDER_SECTION_CLASS}>
      <h3 className={PANEL_FORM_HEADING_CLASS}>닉네임 변경</h3>

      <form onSubmit={handleSubmit} className={PANEL_FORM_CLASS}>
        <div className={INPUT_WRAP_CLASS}>
          <AuthInputSlot
            name="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="새 닉네임"
            autoComplete="off"
            leadingIcon={<UserIcon />}
          />
        </div>

        <AccountPanelFormActions msg={nicknameMsg} confirmDisabled={nicknameLoading} />
      </form>
    </section>
  )
}
