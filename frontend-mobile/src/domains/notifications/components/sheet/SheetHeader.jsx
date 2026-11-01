// 알림 시트 머리 줄 (뒤로·제목·닫기), 뒤로는 상세일 때만 보임
// 알림 시트(NotificationSheet.jsx)가 씀
import { NOTIFICATION_ASSETS } from "@/domains/notifications/constants/notificationAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import {
  HEADER_CLASS,
  HEADER_ROW_CLASS,
  ICON_BTN_CLASS,
  ICON_BTN_IMG_CLASS,
  TITLE_CLASS,
} from "@m/domains/notifications/constants/sheetStyle.js"

const BACK_BUTTON = "/button/뒤로가기 버튼2.png"

// 목록일 땐 뒤로 자리를 비워 두고 숨김 (제목이 가운데에 남게)
export default function SheetHeader({ inDetail, onBack, onClose, closeButtonRef }) {
  return (
    <header className={HEADER_CLASS}>
      <div className={HEADER_ROW_CLASS}>
        <button
          type="button"
          className={ICON_BTN_CLASS}
          aria-label="목록으로"
          aria-hidden={!inDetail}
          tabIndex={inDetail ? 0 : -1}
          disabled={!inDetail}
          data-sfx-kind="ui-cancel"
          data-notification-action="back"
          onClick={onBack}
        >
          <img src={publicAsset(BACK_BUTTON)} alt="" draggable={false} className={ICON_BTN_IMG_CLASS} />
        </button>
        <h2 className={TITLE_CLASS} data-notification-heading="true">알림</h2>
        <button
          type="button"
          ref={closeButtonRef}
          className={ICON_BTN_CLASS}
          aria-label="닫기"
          data-sfx-kind="ui-cancel"
          data-notification-action="close"
          onClick={onClose}
        >
          <img src={publicAsset(NOTIFICATION_ASSETS.closeButton)} alt="" draggable={false} className={ICON_BTN_IMG_CLASS} />
        </button>
      </div>
    </header>
  )
}
