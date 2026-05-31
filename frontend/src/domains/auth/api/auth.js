const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// 로그인 API
export const loginApi = async (loginData) => {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(loginData),
    credentials: "include", 
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "로그인에 실패했습니다.");
  
  return data;
};

// 회원가입 API
export const signupApi = async (signupData) => {
  const response = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(signupData),
    credentials: "include",
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "회원가입에 실패했습니다.");
  
  return data;
};