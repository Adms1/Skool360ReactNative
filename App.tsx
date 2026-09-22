import React, {useEffect} from 'react';
import {StatusBar, Platform} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import RootNavigator from './src/navigator/Rootnavigator';
import {navigationRef} from './src/navigator/Navigationref';
import {initNotifications, registerDeviceForPush} from './src/services/Notificationservice';
import {AuthService} from './src/services/Authservice';

const App: React.FC = () => {
  useEffect(() => {
    StatusBar.setBarStyle('light-content');

    // 1. Initialize notification listeners
    const cleanup = initNotifications(async () => {
      const session = await AuthService.getSession();
      if (session && navigationRef.isReady()) {
        navigationRef.reset({
          index: 0,
          routes: [
            {
              name: 'DashboardWebView',
              params: {username: session.username, password: session.password},
            },
          ],
        });
      }
    });

    // 2. Request permission and register FCM token with backend
    registerDeviceForPush();

    return cleanup;
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <RootNavigator />
    </SafeAreaProvider>
  );
};

export default App;