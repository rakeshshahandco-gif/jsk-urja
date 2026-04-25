import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { View, ActivityIndicator, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { LoginScreen } from '../screens/LoginScreen';
import { TaskDashboardScreen } from '../screens/TaskDashboardScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { TaskCreateScreen } from '../screens/TaskCreateScreen';
import { ExtendTaskScreen } from '../screens/ExtendTaskScreen';
import { CustomerListScreen } from '../screens/CustomerListScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { CustomerCreateScreen } from '../screens/CustomerCreateScreen';
import { CustomerEditScreen } from '../screens/CustomerEditScreen';
import { CustomerInteractionScreen } from '../screens/CustomerInteractionScreen';
import { SalesListScreen } from '../screens/SalesListScreen';
import { SalesDetailScreen } from '../screens/SalesDetailScreen';
import { SalesInvoiceCreateScreen } from '../screens/SalesInvoiceCreateScreen';
import { FollowUpListScreen } from '../screens/FollowUpListScreen';
import { ReminderListScreen } from '../screens/ReminderListScreen';
import { SalesOrderCreateScreen } from '../screens/SalesOrderCreateScreen';
import { COLORS, SHADOW } from '../theme/colors';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Settings Placeholder for now
const SettingsScreen = ({ navigation }) => {
  const { logout, user } = useAuth();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{ padding: 20, backgroundColor: COLORS.primary, marginBottom: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.white }}>Profile & Settings</Text>
      </View>
      <View style={{ padding: 20, backgroundColor: COLORS.white, margin: 16, borderRadius: 12, ...SHADOW.card }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.gray800 }}>Logged in as</Text>
        <Text style={{ fontSize: 14, color: COLORS.gray500, marginBottom: 20 }}>{user?.name || user?.username || 'User'}</Text>
        
        <TouchableOpacity 
          style={{ backgroundColor: COLORS.danger, padding: 15, borderRadius: 8, alignItems: 'center' }}
          onPress={logout}
        >
          <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>LOGOUT FROM CRM</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: COLORS.gray400,
      tabBarStyle: {
        height: 60,
        paddingBottom: 8,
        paddingTop: 8,
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: COLORS.gray100,
      },
      tabBarLabelStyle: {
        fontSize: 10,
        fontWeight: 'bold',
      },
    })}
  >
    <Tab.Screen 
      name="Tasks" 
      component={TaskDashboardScreen} 
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>📋</Text> }}
    />
    <Tab.Screen 
      name="Customers" 
      component={CustomerListScreen} 
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>👤</Text> }}
    />
    <Tab.Screen 
      name="Sales" 
      component={SalesListScreen} 
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🧾</Text> }}
    />
    <Tab.Screen 
      name="Follow-ups" 
      component={FollowUpListScreen} 
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🤝</Text> }}
    />
    <Tab.Screen 
      name="Reminders" 
      component={ReminderListScreen} 
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>⏰</Text> }}
    />
    <Tab.Screen 
      name="Settings" 
      component={SettingsScreen} 
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>⚙️</Text> }}
    />
  </Tab.Navigator>
);

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
  </Stack.Navigator>
);

const AppStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Main" component={MainTabs} />
    <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
    <Stack.Screen name="CreateTask" component={TaskCreateScreen} />
    <Stack.Screen name="ExtendTask" component={ExtendTaskScreen} />
    {/* Keep these in stack for deep navigation from tabs */}
    <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
    <Stack.Screen name="CreateCustomer" component={CustomerCreateScreen} />
    <Stack.Screen name="EditCustomer" component={CustomerEditScreen} />
    <Stack.Screen name="CustomerInteraction" component={CustomerInteractionScreen} />
    <Stack.Screen name="SalesDetail" component={SalesDetailScreen} />
    <Stack.Screen name="CreateInvoice" component={SalesInvoiceCreateScreen} />
    <Stack.Screen name="CreateOrder" component={SalesOrderCreateScreen} />
  </Stack.Navigator>
);

export const AppNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary }}>
        <ActivityIndicator size="large" color={COLORS.white} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
};
