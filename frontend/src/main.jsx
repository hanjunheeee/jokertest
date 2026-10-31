import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client'
import '@/app/index.css'
import App from '@/app/App'
import { handleAuthUnauthorized } from '@/domains/auth/api/unauthorized'
import { setUnauthorizedHandler } from '@/shared/api/response'

setUnauthorizedHandler(handleAuthUnauthorized)

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>
)
