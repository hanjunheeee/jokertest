// 가입 단계 아래 버튼 줄 (이전·다음, 마지막 단계는 가입 버튼)
// signup/SignupForm.jsx가 씀
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import ImageButton from "@m/domains/auth/components/login/ui/ImageButton.jsx"
import { HINT_TEXT_CLASS } from "@m/domains/auth/components/login/ui/styles.js"

// 이전·다음 글자 버튼 모양 (그림 없는 버튼, 누르는 자리 44px)
const STEP_BTN_CLASS =
  "min-h-11 flex-1 cursor-pointer rounded border border-black/30 bg-black/10 px-3 font-subheading font-bold text-black active:bg-black/20 app-text-scaled [--app-text-size:15px]"

// 가입 버튼은 데스크톱처럼 canSubmitSignup이 거짓이면 잠그고 안내를 띄움
export default function StepNav({ step, isLastStep, onPrev, onNext, canSubmitSignup }) {
  return (
    <div className="flex flex-col gap-2">
      {isLastStep && !canSubmitSignup && (
        <p className={HINT_TEXT_CLASS}>이메일 인증을 완료해야 가입할 수 있습니다.</p>
      )}

      {isLastStep && (
        <ImageButton
          type="submit"
          src={LOGIN_ASSETS.signupButton}
          label="회원가입"
          disabled={!canSubmitSignup}
          className="mx-auto w-[86%]"
        />
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <button type="button" onClick={onPrev} className={STEP_BTN_CLASS}>이전</button>
        )}
        {!isLastStep && (
          <button type="button" onClick={onNext} className={STEP_BTN_CLASS}>다음</button>
        )}
      </div>
    </div>
  )
}
