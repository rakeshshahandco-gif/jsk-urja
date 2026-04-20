import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/tailwind.css'
import './styles/main.scss'

import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
)
