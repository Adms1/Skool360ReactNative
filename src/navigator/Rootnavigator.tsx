import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RootStackParamList} from './types';
import {navigationRef} from './Navigationref';
import AuthGateScreen from '../screens/Authgatescreen';
import LoginScreen from '../screens/Loginscreen';
import DashboardWebViewScreen from '../screens/Dashboardwebviewscreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator: React.FC = () => {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator initialRouteName="AuthGate" screenOptions={{headerShown: false}}>
        <Stack.Screen name="AuthGate" component={AuthGateScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="DashboardWebView" component={DashboardWebViewScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;