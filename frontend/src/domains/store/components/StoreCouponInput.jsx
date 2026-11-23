// 상점 쿠폰 코드 입력 (입력창1 그림 위에 글자)
// StoreCouponDialog가 씀
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import {
  COUPON_INPUT_FIELD_CLASS,
  COUPON_INPUT_IMG_CLASS,
  COUPON_INPUT_ROW_CLASS,
  COUPON_INPUT_WRAP_CLASS,
} from "@/domains/store/constants/storeCouponDialogStyle.js"

export default function StoreCouponInput({ inputRef, value, onChange, disabled = false, ...rest }) {
  return (
    <div className={COUPON_INPUT_WRAP_CLASS}>
      <PublicAsset src={LOGIN_ASSETS.input} alt="" className={COUPON_INPUT_IMG_CLASS} />
      <div className={COUPON_INPUT_ROW_CLASS}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={COUPON_INPUT_FIELD_CLASS}
          {...rest}
        />
      </div>
    </div>
  )
}
