import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { View, ActivityIndicator, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { LoginScreen } from '../screens/LoginScreen';
import { ModuleHomeScreen } from '../screens/ModuleHomeScreen';
import { TaskDashboardScreen } from '../screens/TaskDashboardScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { TaskCreateScreen } from '../screens/TaskCreateScreen';
import { ExtendTaskScreen } from '../screens/ExtendTaskScreen';
import { CustomerListScreen } from '../screens/CustomerListScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { CustomerCreateScreen } from '../screens/CustomerCreateScreen';
import { CustomerEditScreen } from '../screens/CustomerEditScreen';
import { SalesListScreen } from '../screens/SalesListScreen';
import { SalesDetailScreen } from '../screens/SalesDetailScreen';
import { SalesInvoiceCreateScreen } from '../screens/SalesInvoiceCreateScreen';
import { SalesOrderCreateScreen } from '../screens/SalesOrderCreateScreen';
import { PermissionGate } from '../components/PermissionGate';
import { ScreenErrorBoundary } from '../components/ScreenErrorBoundary';
import ENV from '../config/env';
import { COLORS, SHADOW } from '../theme/colors';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const SettingsScreen = () => {
  const { logout, user } = useAuth();
  const { selectedCompany } = useCompany();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{ padding: 20, backgroundColor: COLORS.primary, marginBottom: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.white }}>Profile & Settings</Text>
      </View>
      <View style={{ padding: 20, backgroundColor: COLORS.white, margin: 16, borderRadius: 12, ...SHADOW.card }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.gray800 }}>Logged in as</Text>
        <Text style={{ fontSize: 14, color: COLORS.gray500, marginBottom: 8 }}>
          {user?.name || user?.username || 'User'}
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.gray500, marginBottom: 4 }}>
          Company: {selectedCompany?.companyName || '—'}
        </Text>
        <Text style={{ fontSize: 11, color: COLORS.gray400, marginBottom: 20 }}>
          v{ENV.version} · {ENV.envName} · {ENV.apiUrl}
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: COLORS.danger, padding: 15, borderRadius: 8, alignItems: 'center' }}
          onPress={logout}
        >
          <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>LOGOUT</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const CrmStack = createStackNavigator();

/** CRM list + create/detail live in one stack (fixes + New on web and APK). */
const CrmTab = () => (
  <PermissionGate permission="customers.customer_master.view" title="CRM access denied">
    <CrmStack.Navigator screenOptions={{ headerShown: false }}>
      <CrmStack.Screen name="CustomerList" component={CustomerListScreen} />
      <CrmStack.Screen name="CreateCustomer" component={CustomerCreateScreenSafe} />
      <CrmStack.Screen name="CustomerDetail" component={CustomerDetailScreenSafe} />
      <CrmStack.Screen name="EditCustomer" component={withBoundary(CustomerEditScreen)} />
    </CrmStack.Navigator>
  </PermissionGate>
);

const TasksTab = ({ navigation }) => (
  <PermissionGate permission="tasks.task_list.view" title="Tasks access denied">
    <TaskDashboardScreen navigation={navigation} />
  </PermissionGate>
);

const SalesTab = ({ navigation }) => (
  <PermissionGate
    permissions={['sales.sales_orders.view', 'sales.sales_invoices.view']}
    title="Sales access denied"
  >
    <SalesListScreen navigation={navigation} />
  </PermissionGate>
);

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: COLORS.gray400,
      tabBarStyle: {
        height: 62,
        paddingBottom: 8,
        paddingTop: 6,
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: COLORS.gray100,
      },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
    }}
  >
    <Tab.Screen
      name="Home"
      component={ModuleHomeScreen}
      options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🏠</Text> }}
    />
    <Tab.Screen
      name="CRM"
      component={CrmTab}
      options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text> }}
    />
    <Tab.Screen
      name="Tasks"
      component={TasksTab}
      options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text> }}
    />
    <Tab.Screen
      name="Sales"
      component={SalesTab}
      options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧾</Text> }}
    />
    <Tab.Screen
      name="Settings"
      component={SettingsScreen}
      options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>⚙️</Text> }}
    />
  </Tab.Navigator>
);

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
  </Stack.Navigator>
);

const withBoundary = (Component) => (props) => (
  <ScreenErrorBoundary>
    <Component {...props} />
  </ScreenErrorBoundary>
);

const CreateTaskScreen = withBoundary(TaskCreateScreen);
const TaskDetailScreenSafe = withBoundary(TaskDetailScreen);
const SalesDetailScreenSafe = withBoundary(SalesDetailScreen);
const CustomerDetailScreenSafe = withBoundary(CustomerDetailScreen);
const SalesInvoiceCreateScreenSafe = withBoundary(SalesInvoiceCreateScreen);
const SalesOrderCreateScreenSafe = withBoundary(SalesOrderCreateScreen);
const CustomerCreateScreenSafe = withBoundary(CustomerCreateScreen);

const AppStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Main" component={MainTabs} />
    <Stack.Screen name="TaskDetail" component={TaskDetailScreenSafe} />
    <Stack.Screen name="CreateTask" component={CreateTaskScreen} />
    <Stack.Screen name="ExtendTask" component={withBoundary(ExtendTaskScreen)} />
    <Stack.Screen name="SalesDetail" component={SalesDetailScreenSafe} />
    <Stack.Screen name="CreateInvoice" component={SalesInvoiceCreateScreenSafe} />
    <Stack.Screen name="CreateOrder" component={SalesOrderCreateScreenSafe} />
  </Stack.Navigator>
);

const StartupLoading = ({ message }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary }}>
    <ActivityIndicator size="large" color={COLORS.white} />
    <Text style={{ color: COLORS.white, marginTop: 12 }}>{message}</Text>
  </View>
);

const CompanyBlockedScreen = ({ error, onRetry, onLogout }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, padding: 24 }}>
    <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.gray800, marginBottom: 8 }}>Company not loaded</Text>
    <Text style={{ fontSize: 14, color: COLORS.gray500, textAlign: 'center', marginBottom: 24 }}>
      {error || 'Could not connect to server or no active company for this account.'}
    </Text>
    <TouchableOpacity
      style={{ backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginBottom: 12 }}
      onPress={onRetry}
    >
      <Text style={{ color: COLORS.white, fontWeight: '700' }}>Retry</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={onLogout}>
      <Text style={{ color: COLORS.gray500, fontWeight: '600' }}>Log out</Text>
    </TouchableOpacity>
  </View>
);

export const AppNavigator = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const { selectedCompany, loading: companyLoading, error: companyError, refreshCompanies } = useCompany();

  if (authLoading) {
    return <StartupLoading message="Loading JSK CRM…" />;
  }

  if (!user) {
    return (
      <NavigationContainer>
        <AuthStack />
      </NavigationContainer>
    );
  }

  if (companyLoading) {
    return <StartupLoading message="Loading company data…" />;
  }

  if (!selectedCompany) {
    return (
      <CompanyBlockedScreen
        error={companyError}
        onRetry={refreshCompanies}
        onLogout={logout}
      />
    );
  }

  return (
    <NavigationContainer>
      <AppStack />
    </NavigationContainer>
  );
};
