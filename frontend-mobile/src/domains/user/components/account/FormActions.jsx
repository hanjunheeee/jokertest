// 계정 폼 아래 줄 (결과 문구 + 확인 버튼)
// NicknameSection·PasswordSection이 씀

import ConfirmButton from "./ConfirmButton.jsx"
import Feedback from "./Feedback.jsx"

// 결과 문구는 있을 때만, 버튼은 오른쪽
export default function FormActions({ msg, confirmLabel = "변경", confirmDisabled = false }) {
    return (
        <div className="flex w-full flex-col gap-1.5">
            {msg ? <Feedback msg={msg} /> : null}
            <div className="flex w-full justify-end">
                <ConfirmButton label={confirmLabel} disabled={confirmDisabled} />
            </div>
        </div>
    )
}
