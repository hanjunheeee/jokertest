// 골드·다이아 서버 부르기 파일, 회원 지갑 보기 · 주고 뺏기 (/admin-api/members/:uuid/wallet)
// 회원 상세 안 WalletPanel이 씀
import { adminApi } from '@/admin/shared/api/adminClient'

const walletPath = (uuid) => `/members/${encodeURIComponent(uuid)}/wallet`

// 장부 사유 코드 → 화면 글 (결제 주문 상세도 씀), 모르는 코드는 코드 그대로
const LEDGER_REASONS = Object.freeze({
  ADMIN_GRANT: '관리자 지급', ADMIN_REVOKE: '관리자 회수', TOPUP_REFUND: '충전 환불', DIAMOND_TOPUP: '다이아 충전',
  GOLD_PURCHASE: '골드 구매', PURCHASE: '상점 구매', COUPON_REWARD: '쿠폰 보상', ACHIEVEMENT_REWARD: '업적 보상',
  DEFAULT_GRANT: '기본 지급', EVENT_COMPENSATION_GOLD: '이벤트 보상',
})
export const ledgerReasonLabel = (reason) => LEDGER_REASONS[reason] ?? reason

export const currencyLabel = (currency) => (currency === 'DIAMOND' ? '다이아' : currency === 'GOLD' ? '골드' : currency)

// 부호 붙인 수 (예: 500 → '+500', -20 → '-20', 1200 → '+1,200')
export const signedAmount = (amount) => (amount > 0 ? `+${amount.toLocaleString('ko-KR')}` : amount.toLocaleString('ko-KR'))

// → { gold, diamond, ledger:[{ id, reason, currency, amount, balanceAfter, createdAt }] }
export const fetchWallet = (uuid) => adminApi.get(walletPath(uuid))

// amount: 주기는 양수, 뺏기는 음수 → { ledgerEntry, balance }
// requestId는 창을 열 때 하나 만들어 둔 것 (두 번 눌러도 한 번만)
export const adjustWallet = (uuid, { requestId, currency, amount, reason }) =>
  adminApi.send('POST', `${walletPath(uuid)}/adjust`, { requestId, currency, amount, reason })
