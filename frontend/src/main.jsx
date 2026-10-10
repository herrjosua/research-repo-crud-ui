import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeatureFlags } from '@carbon/react'
import './index.scss'
import App from './App.jsx'
import { CARBON_FLAGS } from './carbonFlags.js'

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <FeatureFlags flags={CARBON_FLAGS}>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </FeatureFlags>
    </StrictMode>,
)
