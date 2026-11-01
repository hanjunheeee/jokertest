// 그림 배경 입력칸 (앞 아이콘 · 비밀번호 보기 버튼, 데스크톱 AuthInputSlot 그림)
// NicknameSection·PasswordSection이 씀

import { useState } from "react"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import InputIcon from "./InputIcon.jsx"

// passwordToggle이면 보기 상태로 password/text를 고름, 높이 48px (글자 16px라 iOS 확대 없음)
export default function InputSlot({ name, value, onChange, placeholder, autoComplete, icon, passwordToggle = false }) {
    const [visible, setVisible] = useState(false)
    const type = passwordToggle && !visible ? "password" : "text"

    return (
        <div className="relative h-12 w-full">
            <PublicAsset src={LOGIN_ASSETS.input} alt="" className="absolute inset-0 block h-full w-full select-none" />

            <div className="absolute inset-0 flex items-center gap-2 pl-[7%] pr-1">
                {icon ? <InputIcon name={icon} /> : null}

                <input
                    type={type}
                    name={name}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    autoComplete={autoComplete}
                    className="h-full min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/55"
                />

                {passwordToggle ? (
                    <button
                        type="button"
                        onClick={() => setVisible((v) => !v)}
                        aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
                        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
                    >
                        <InputIcon name={visible ? "eyeOff" : "eye"} />
                    </button>
                ) : (
                    <span className="w-3 shrink-0" aria-hidden="true" />
                )}
            </div>
        </div>
    )
}
