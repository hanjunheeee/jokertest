// 아이디 찾기 입력 칸·알림·다시 입력 링크 묶음 (제출 버튼은 페이지가 바닥 줄에 둠)
// pages/FindIdPage.jsx가 찾기 전 화면에 씀
import { FIND_ID_TEXT } from "@/domains/auth/constants/recoveryMessages.js"
import CardIntro from "./CardIntro.jsx"
import FieldLabel from "./FieldLabel.jsx"
import RecoveryAlert from "./RecoveryAlert.jsx"
import TextLink from "./TextLink.jsx"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { CalendarIcon, ProfileIcon } from "@m/shared/ui/input/InputIcons.jsx"

// 보내는 중엔 fieldset으로 칸·링크를 한 번에 잠금 (데스크톱과 같음)
export default function FindIdForm({ status, nickname, setNickname, birthDate, setBirthDate, formError, onRetry }) {
  return (
    <fieldset disabled={status === "submitting"} className="contents">
      <CardIntro>가입할 때 입력한 닉네임과 생년월일로 계정을 찾아드려요</CardIntro>

      <FieldLabel text="닉네임">
        <InputSlot
          look="recovery"
          type="text"
          name="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임을 입력하세요"
          autoComplete="off"
          leadingIcon={<ProfileIcon />}
        />
      </FieldLabel>

      <FieldLabel text="생년월일">
        <InputSlot
          look="recovery"
          type="date"
          name="birthDate"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          autoComplete="bday"
          leadingIcon={<CalendarIcon />}
        />
      </FieldLabel>

      {formError && <RecoveryAlert>{formError}</RecoveryAlert>}

      {/* 결과 알림: 못 찾음·요청 너무 많음·통신 실패 */}
      {status === "notFound" && <RecoveryAlert>{FIND_ID_TEXT.notFound}</RecoveryAlert>}
      {status === "rateLimited" && <RecoveryAlert>{FIND_ID_TEXT.rateLimited}</RecoveryAlert>}
      {status === "failed" && <RecoveryAlert>{FIND_ID_TEXT.failed}</RecoveryAlert>}

      {/* 못 찾음·너무 많음이면 다시 입력, 실패면 재시도 (둘 다 입력 화면으로) */}
      {(status === "notFound" || status === "rateLimited") && <TextLink onClick={onRetry}>다시 입력</TextLink>}
      {status === "failed" && <TextLink onClick={onRetry}>재시도</TextLink>}
    </fieldset>
  )
}
