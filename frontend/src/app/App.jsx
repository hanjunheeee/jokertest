import { RouterProvider } from "react-router-dom"
import { router } from "@/app/routes/index"

export default function App() {
  return <RouterProvider router={router} />;
}
