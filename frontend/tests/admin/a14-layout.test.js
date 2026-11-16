// 관리자 화면 틀 시험: 메뉴 16칸 차례, 휴대폰 서랍 열고 닫기, 위험한 단추만 위험 표시
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-040~042, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-layout.test.js
import test from "node:test"
import assert from "node:assert/strict"
import {
  h, screen, within, cleanup, openAt, press, settle, buttonNamed, isDanger, createFakeServer, ME_OK, setScreenWidth,
  openMemberDetail, detailOf, memberOf,
} from "./a14-kit.mjs"

const { AdminScreens } = await import("../../src/admin/app/AdminApp.jsx")
const { default: PaymentsPage } = await import("../../src/admin/domains/payments/pages/PaymentsPage.jsx")
const { default: MaintenancePage } = await import("../../src/admin/domains/maintenance/pages/MaintenancePage.jsx")

test.afterEach(() => {
  cleanup()
  setScreenWidth(1280)
})

const DASHBOARD = {
  ok: true, totalMembers: 10, todayGames: { finished: 1, inProgress: 0, total: 1 }, inProgressGames: 0, onlineCount: 2,
  openReports: 0, openInquiries: 0, maintenance: { enabled: false, active: false, startsAt: null },
}

// 로그인 된 채로 운영 현황 열기
async function openSignedIn() {
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 200, ME_OK)
  server.answer("GET /admin-api/dashboard", 200, DASHBOARD)
  await openAt("/dashboard", h(AdminScreens))
  await settle(20)
  return server
}

const menuLabels = () => {
  const nav = screen.queryByRole("navigation", { name: "관리자 메뉴" })
  return nav ? within(nav).getAllByRole("link").map((link) => link.textContent) : []
}

test("A14-F-040 메뉴에 모든 영역: 메뉴 16칸이 경계 글 차례대로", async () => {
  await openSignedIn()
  assert.deepEqual(menuLabels(), [
    "운영 현황", "회원", "공지", "처리 이력", "신고", "문의", "점검", "금지어",
    "판 설정", "결제", "상품", "쿠폰", "통계", "지난 판", "약관", "열린 방",
  ])
})

test("A14-F-041 휴대폰 서랍: 좁은 화면 → 메뉴 단추 → 서랍 열림 → \"회원\" 누름 → 서랍 닫히고 회원 화면", async () => {
  setScreenWidth(500)
  await openSignedIn()
  // 처음엔 서랍 닫힘 (메뉴 안 보임)
  assert.equal(menuLabels().length, 0)
  const toggle = buttonNamed("메뉴 열기")
  assert.equal(toggle.getAttribute("aria-expanded"), "false")
  await press(toggle)
  assert.equal(menuLabels().length, 16)
  assert.equal(buttonNamed("메뉴 열기").getAttribute("aria-expanded"), "true")
  const nav = screen.getByRole("navigation", { name: "관리자 메뉴" })
  await press(within(nav).getByRole("link", { name: "회원" }))
  await settle(10)
  assert.equal(menuLabels().length, 0)
  assert.ok(screen.queryByRole("heading", { level: 1, name: "회원" }) !== null, "회원 화면이 아님")
})

// 위험한 단추: 정지·영구 정지·강제 종료·환불·뺏기·점검 켜기(예약) / 보통 단추: 주기·기간 바꾸기·제재 해제·점검 끄기
test("A14-F-042 위험한 단추만 위험 표시: 정지·영구 정지·강제 종료·환불·뺏기·점검 켜기 → 위험 표시, 보통 단추엔 없음", async () => {
  const marks = {}
  const mark = (name) => {
    const button = buttonNamed(name)
    assert.ok(button !== null, `"${name}" 단추가 없음`)
    marks[name] = isDanger(button)
  }

  // 회원 상세 (정지 없음 → 기간 정지·영구 정지·강제 접속 종료 / 지갑 주기·뺏기)
  await openMemberDetail({ wallet: { ok: true, gold: 100, diamond: 0, ledger: [] } })
  for (const name of ["기간 정지", "영구 정지", "강제 접속 종료", "주기", "뺏기"]) mark(name)
  cleanup()

  // 회원 상세 (정지 중 → 기간 바꾸기·제재 해제)
  const activeBan = { id: 3, active: true, isPermanent: false, startAt: "2026-11-10T00:00:00.000Z", endAt: "2026-11-17T00:00:00.000Z", reason: "욕설", bannedByLoginId: "ceo", liftReason: null, liftedByLoginId: null, liftedAt: null }
  await openMemberDetail({ detail: detailOf({ member: memberOf(), bans: [activeBan] }) })
  for (const name of ["기간 바꾸기", "제재 해제"]) mark(name)
  cleanup()

  // 충전 주문 (지급됨 → 환불)
  const server = createFakeServer()
  server.answer("GET /admin-api/payments/orders/order-a14-1", 200, {
    ok: true,
    order: {
      orderId: "order-a14-1", status: "GRANTED", user: { uuid: "a14f0000-0000-4000-8000-000000000001", nickname: "가면1" },
      orderName: "다이아 100", productId: "dia-100", version: 1, payAmount: 1100, grantAmount: 100, bonusAmount: 0,
      createdAt: "2026-11-15T00:00:00.000Z", grantedAt: "2026-11-15T00:01:00.000Z",
    },
    ledger: [],
  })
  server.answer("GET /admin-api/maintenance", 200, {
    ok: true,
    maintenance: { enabled: true, active: false, message: null, startsAt: "2026-11-20T00:00:00.000Z", endsAt: null, updatedAt: null },
    liveGames: 0, liveRooms: 0, liveNodes: [], forceEnds: [],
  })
  await openAt("/payments/orders/order-a14-1", h(PaymentsPage), "/payments/*")
  mark("환불")
  cleanup()

  // 점검 (예약된 상태 → 점검 바꾸기(켜기)·점검 끄기)
  await openAt("/maintenance", h(MaintenancePage))
  marks["점검 켜기"] = isDanger(buttonNamed("점검 바꾸기"))
  mark("점검 끄기")

  assert.deepEqual(marks, {
    "기간 정지": true, "영구 정지": true, "강제 접속 종료": true, "환불": true, "뺏기": true, "점검 켜기": true,
    "주기": false, "기간 바꾸기": false, "제재 해제": false, "점검 끄기": false,
  })
})
