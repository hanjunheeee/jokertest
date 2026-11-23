// 계정 폼 아래 줄 (결과 문구 + 확인 버튼)
// NicknameSection·PasswordSection이 씀

import {
    ACCOUNT_FORM_ACTIONS_ROW_CLASS,
    ACCOUNT_FORM_ACTIONS_STACK_CLASS,
    ACCOUNT_FORM_ALIGN_CLASS,
} from "@m/domains/user/constants/accountFormLayout.js"
import ConfirmButton from "./ConfirmButton.jsx"
import Feedback from "./Feedback.jsx"

// 결과 문구는 있을 때만, 버튼은 오른쪽
export default function FormActions({ msg, confirmLabel = "변경", confirmDisabled = false }) {
    return (
        <div className={ACCOUNT_FORM_ACTIONS_STACK_CLASS}>
            {msg ? (
                <div className={ACCOUNT_FORM_ALIGN_CLASS}>
                    <Feedback msg={msg} />
                </div>
            ) : null}
            <div className={ACCOUNT_FORM_ACTIONS_ROW_CLASS}>
                <ConfirmButton label={confirmLabel} disabled={confirmDisabled} />
            </div>
        </div>
    )
}
