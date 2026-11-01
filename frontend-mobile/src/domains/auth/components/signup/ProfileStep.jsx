// 가입 3단계: 닉네임, 생년월일 (폰 기본 날짜 선택기)
// signup/SignupForm.jsx가 step 2일 때 씀
import InputSlot from "@m/domains/auth/components/login/ui/InputSlot.jsx"
import { CalendarIcon, ProfileIcon } from "@m/domains/auth/components/login/ui/icons.jsx"

// name이 formData 키와 같아야 useLoginPage 입력 처리가 맞는 칸을 고침
export default function ProfileStep({ formData, onChange }) {
  return (
    <>
      <InputSlot
        type="text"
        name="nickname"
        value={formData.nickname}
        onChange={onChange}
        leadingIcon={<ProfileIcon />}
        placeholder="닉네임 (2~8자, 한글/영문/숫자)"
        ariaLabel="사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)"
        autoComplete="nickname"
      />
      <InputSlot
        type="date"
        name="birthDate"
        value={formData.birthDate}
        onChange={onChange}
        leadingIcon={<CalendarIcon />}
        placeholder="생년월일을 선택하세요"
        ariaLabel="생년월일"
      />
    </>
  )
}
