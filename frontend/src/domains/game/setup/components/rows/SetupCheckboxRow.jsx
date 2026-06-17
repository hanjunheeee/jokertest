/**
 * 설정 목록 checkbox 한 줄 — 제목·설명(선택) + 체크 토글
 * SetupTabContent에서 type: "checkbox" 항목에 사용
 *
 * props
 * - label: 항목 제목
 * - description: 부가 설명 (없으면 미표시)
 * - checked: 체크 여부
 * - onChange: 토글 시 다음 checked 값 전달
 */
import { GAME_SETUP_ASSETS } from "../../constants/gameSetupAssets.js"
import {
  SETUP_DESC_CLASS,
  SETUP_ROW_CLASS,
  SETUP_TITLE_CLASS,
} from "../../constants/setupRowStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 체크박스 이미지·체크표시 오버레이로 on/off 표시 */
export default function SetupCheckboxRow({ label, description, checked, onChange }) {
  return (
    <div className={SETUP_ROW_CLASS} data-setup-row>
      <div className="min-w-0 flex-1">
        <p className={SETUP_TITLE_CLASS}>{label}</p>
        {description ? <p className={SETUP_DESC_CLASS}>{description}</p> : null}
      </div>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="group relative mt-px block w-[clamp(1.5rem,2.1vw,1.75rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"
        style={{ outline: "none" }}
      >
        <span className="interactive-scale-sm relative block">
          <PublicAsset
            src={GAME_SETUP_ASSETS.checkbox}
            alt=""
            className="block h-auto w-full select-none"
          />
          {checked ? (
            <PublicAsset
              src={GAME_SETUP_ASSETS.checkMark}
              alt=""
              className="pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"
            />
          ) : null}
        </span>
      </button>
    </div>
  )
}
