// 쿠폰 서버 부르기 파일, 쿠폰 목록 · 만들기 · 켜고 끄기 · 쓴 사람 목록 (/admin-api/coupons)
// 쿠폰 화면(CouponsPage·CouponForm)이 씀
import { adminApi } from '@/admin/shared/api/adminClient'

const beforeQuery = (before) => (before ? `?before=${encodeURIComponent(before)}` : '')

// → { items:[{ id, code, rewardType, rewardAmount, maxUses, usedCount, startsAt, endsAt, isActive, createdAt }], nextBefore }
export const fetchCoupons = ({ before } = {}) => adminApi.get(`/coupons${beforeQuery(before)}`)

// { code, rewardType, rewardAmount, maxUses|null, startsAt|null, endsAt|null } → { coupon }
export const createCoupon = (coupon) => adminApi.send('POST', '/coupons', coupon)

export const setCouponActive = (id, isActive) => adminApi.send('PATCH', `/coupons/${id}`, { isActive })

// → { items:[{ id, userUuid, nickname, redeemedAt }], nextBefore }
export const fetchRedemptions = (id, { before } = {}) => adminApi.get(`/coupons/${id}/redemptions${beforeQuery(before)}`)
