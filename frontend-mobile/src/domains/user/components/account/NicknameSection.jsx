// 닉네임 바꾸기 칸 (입력 + 결과 문구 + 변경 버튼)
// AccountPanel이 씀, 값·보내기는 데스크톱 useNicknameForm (useAccountForm 경유)

import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import FormActions from "./FormActions.jsx"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { UserIcon } from "@m/shared/ui/input/InputIcons.jsx"
import { MUTED_ICON_CLASS } from "@m/shared/ui/input/inputSlotLooks.js"
import SectionTitle from "./SectionTitle.jsx"

// 보낼 때 확인 소리 후 폼 처리로 넘김, 보내는 중엔 버튼 잠금
export default function NicknameSection({ nickname, setNickname, nicknameMsg, nicknameLoading, onSubmit }) {
    const handleSubmit = (event) => {
        dispatchUiSfx("ui-confirm", event)
        onSubmit(event)
    }

    return (
        <section className="flex flex-col gap-2 border-b border-[#8b6a3e]/30 pb-4">
            <SectionTitle>닉네임 변경</SectionTitle>

            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2">
                <InputSlot
                    name="nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="새 닉네임"
                    autoComplete="off"
                    look="account"
                    leadingIcon={<UserIcon className={MUTED_ICON_CLASS} />}
                />
                <FormActions msg={nicknameMsg} confirmDisabled={nicknameLoading} />
            </form>
        </section>
    )
}
