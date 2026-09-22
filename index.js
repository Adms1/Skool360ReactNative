/**
 * @format
 */
import {AppRegistry, Platform} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

try {
  const messagingModule = require('@react-native-firebase/messaging');
  const notifeeModule = require('@notifee/react-native');

  const {getMessaging, setBackgroundMessageHandler} = messagingModule;
  const notifee = notifeeModule.default || notifeeModule;
  const {AndroidImportance} = notifeeModule;

  // Background message receiver (fires when app is closed / killed)
  setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
    console.log('[FCM Background] Message received:', remoteMessage);

    // Create channel
    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: 'default',
        name: 'General notifications',
        importance: AndroidImportance.HIGH,
        vibration: true,
      });
    }

    // Extract title & body from either notification or data object
    const title =
      remoteMessage.notification?.title ||
      remoteMessage.data?.title ||
      'Notification';
    const body =
      remoteMessage.notification?.body ||
      remoteMessage.data?.body ||
      remoteMessage.data?.message ||
      '';

    if (title || body) {
      await notifee.displayNotification({
        title,
        body,
        data: remoteMessage.data,
        android: {
          channelId: 'default',
          importance: AndroidImportance.HIGH,
          pressAction: {id: 'default'},
          smallIcon: 'ic_launcher',
        },
      });
    }
  });

  notifee.onBackgroundEvent(async ({type, detail}) => {
    console.log('[Notifee Background Event]:', type, detail);
  });
} catch (e) {
  console.warn('Push background setup failed:', e);
}

AppRegistry.registerComponent(appName, () => App);
if (appName !== 'Skool360Mobile') {
  AppRegistry.registerComponent('Skool360Mobile', () => App);
}