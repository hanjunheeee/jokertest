// 방관리 탭 한 줄: 제목·설명과 오른쪽 링크 버튼 또는 체크 칸
// 방관리 탭(RoomTab)이 씀 (데스크톱 SettingRoomRow와 같은 구성)
import CheckBox from "../parts/CheckBox.jsx"
import { LINK_CLASS, LINK_DANGER_CLASS, ROW_DESC_CLASS, ROW_LABEL_CLASS, ROW_PLATE_CLASS } from "./rowStyle.js"

// variant가 action이면 링크 버튼(danger면 붉은 글자), 아니면 체크 칸
export default function RoomRow({
  title, description, variant, actionLabel, actionTone = "default", checked, onAction, onChange,
}) {
  return (
    <div className={ROW_PLATE_CLASS} data-setting-row>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={ROW_LABEL_CLASS}>{title}</span>
        {/* 설명은 있을 때만 */}
        {description ? <span className={ROW_DESC_CLASS}>{description}</span> : null}
      </div>
      {variant === "action" ? (
        <button
          type="button"
          onClick={onAction}
          className={actionTone === "danger" ? LINK_DANGER_CLASS : LINK_CLASS}
          style={{ outline: "none" }}
        >
          {actionLabel}
        </button>
      ) : (
        <CheckBox ariaLabel={title} checked={checked} onChange={onChange} />
      )}
    </div>
  )
}
