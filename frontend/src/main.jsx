import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeatureFlags } from '@carbon/react'
import './index.scss'
import App from './App.jsx'

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <FeatureFlags flags={{
            'enable-experimental-focus-wrap-without-sentinels': true,
            'enable-focus-wrap-without-sentinels': true,
        }}>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </FeatureFlags>
    </StrictMode>,
)
