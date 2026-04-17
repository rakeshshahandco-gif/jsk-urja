import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import { LoginScreen } from '../screens/LoginScreen';
import { TaskDashboardScreen } from '../screens/TaskDashboardScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { TaskCreateScreen } from '../screens/TaskCreateScreen';
import { ExtendTaskScreen } from '../screens/ExtendTaskScreen';
import { COLORS } from '../theme/colors';

const Stack = createStackNavigator();

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
  </Stack.Navigator>
);

const AppStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Dashboard" component={TaskDashboardScreen} />
    <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
    <Stack.Screen name="CreateTask" component={TaskCreateScreen} />
    <Stack.Screen name="ExtendTask" component={ExtendTaskScreen} />
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
