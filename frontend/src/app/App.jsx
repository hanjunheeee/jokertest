import { useEffect } from "react"
import { RouterProvider } from "react-router-dom"
import { router } from "@/app/routes/index"
import { useAuthStore } from "@/domains/auth/store/authStore"
import { getMeApi } from "@/domains/auth/api/auth"

export default function App() {
  useEffect(() => {
    if (!useAuthStore.getState().isLoggedIn) return;
    getMeApi().catch(() => {});
  }, []);

  return <RouterProvider router={router} />;
}
