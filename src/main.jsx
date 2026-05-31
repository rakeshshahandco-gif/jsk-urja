import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/tailwind.css'
import './styles/main.scss'
import './styles/jskUiCustomization.css'
import './styles/mobileTabletShell.css'

import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);

