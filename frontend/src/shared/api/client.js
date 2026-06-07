const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const apiClient= async (endpoint, options = {}) => {
    const url = `${BASE_URL}${endpoint}`;

    const defaultOptions = {
        method: "GET",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
        ...options,
    };

    const response = await fetch(url, defaultOptions);

    if(!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "API 요청 중 에러가 발생");
    }

    return response.json();
}