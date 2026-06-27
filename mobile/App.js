import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import { AuthProvider } from './src/context/AuthContext';
import { CompanyProvider } from './src/context/CompanyContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';

// Avoid blank screen on some Android + react-navigation release builds
enableScreens(false);

/**
 * JSK CRM — native mobile UI for CRM, Tasks, and Sales.
 * Uses the same Render backend APIs and live MongoDB as web CRM.
 */
export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <CompanyProvider>
            <StatusBar style="light" backgroundColor="#1e3a8a" />
            <AppNavigator />
          </CompanyProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
