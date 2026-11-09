// 상품 서버 부르기 파일, 다이아·골드 상품 목록 · 만들기 · 고치기 (/admin-api/products)
// 상품 화면(ProductsPage·ProductForm)이 씀
import { adminApi } from '@/admin/shared/api/adminClient'

export const KIND_LABELS = Object.freeze({ DIAMOND_TOPUP: '다이아 충전(원 → 다이아)', GOLD_PURCHASE: '골드 구매(다이아 → 골드)' })
export const STATUS_LABELS = Object.freeze({ ON_SALE: '판매 중', STOPPED: '판매 중지' })

// → { items:[{ productId, kind, displayName, payCurrency, payAmount, grantCurrency, grantAmount, bonusAmount, status, sortOrder, version, valid }] }
export const fetchProducts = () => adminApi.get('/products')

// → { product }
export const createProduct = (product) => adminApi.send('POST', '/products', product)

// expectedVersion: 화면이 본 판 번호 (그사이 남이 고쳤으면 409) → { product }
export const updateProduct = (productId, expectedVersion, changes) =>
  adminApi.send('PATCH', `/products/${encodeURIComponent(productId)}`, { expectedVersion, ...changes })
