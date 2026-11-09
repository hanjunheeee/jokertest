// 관리자 로그인 경로 부르기 파일, /admin-api/auth/me · login · logout
// useAdminSession(세션 확인·로그인·로그아웃)과 LoginPage가 씀
import { adminApi } from '@/admin/shared/api/adminClient'

// 응답: { admin:{ id, loginId, email }, csrfToken, idleExpiresAt }
export const fetchMe = () => adminApi.get('/auth/me')

// 세 칸을 한 번에 (쓰기 확인 값은 아직 없음, 서버는 로그인만 그걸 안 봄)
export const loginRequest = ({ loginId, password, otp }) => adminApi.send('POST', '/auth/login', { loginId, password, otp })

export const logoutRequest = () => adminApi.send('POST', '/auth/logout')
