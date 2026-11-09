// 모바일 알림 창 그림 (공통 상수는 데스크톱, 팝업 틀은 public/mobile, 대제목 판은 탑레벨 프레임)
// 알림 창 NotificationSheet·줄·버튼·sheetStyle이 씀
import { NOTIFICATION_ASSETS as DESKTOP_NOTIFICATION_ASSETS } from "@/domains/notifications/constants/notificationAssets.js"

export const NOTIFICATION_ASSETS = {
  ...DESKTOP_NOTIFICATION_ASSETS,
  popupFrame: "/mobile/매칭 팝업 프레임-모바일.png".normalize("NFD"),
  itemSlot: "/mobile/입력창1-모바일.png".normalize("NFD"),
  titlePlate: "/frame/탑레벨 프레임_1_.png".normalize("NFD"),
}
