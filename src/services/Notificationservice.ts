import {Platform, PermissionsAndroid} from 'react-native';
import {buildDeviceTokenUrl,buildDeviceTokenRemoveUrl} from './api';
import {AuthService} from './Authservice';
import {Alert} from 'react-native';
const DEFAULT_CHANNEL_ID = 'default';
let initialized = false;

export async function removeTokenFromServer(): Promise<void> {
  try {
    const modules = loadPushModules();
    if (!modules) return;

    const session = await AuthService.getSession();
    if (!session || !session.user?.userid) {
      return;
    }

    const fcmToken = await modules.getToken(modules.messagingInstance);
    const url = buildDeviceTokenRemoveUrl(fcmToken, session.user.userid);
    const response = await fetch(url, {method: 'POST'});
    const responseText = await response.text();
  } catch (err) {
  }
}

function loadPushModules() {
  try {
    const messagingModule = require('@react-native-firebase/messaging');


    const notifeeModule = require('@notifee/react-native');


    const notifee = notifeeModule.default || notifeeModule;
    const {AndroidImportance, EventType} = notifeeModule;
    const {
      getMessaging,
      getToken,
      registerDeviceForRemoteMessages,
      onMessage,
      onNotificationOpenedApp,
      onTokenRefresh,
      getInitialNotification,
    } = messagingModule;

    return {
      messagingInstance: getMessaging(),
      getToken,
      registerDeviceForRemoteMessages,
      onMessage,
      onNotificationOpenedApp,
      onTokenRefresh,
      getInitialNotification,
      notifee,
      AndroidImportance,
      EventType,
    };
    } catch (e: any) {

      return null;
    }
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const modules = loadPushModules();
  if (!modules) return;

  await modules.notifee.createChannel({
    id: DEFAULT_CHANNEL_ID,
    name: 'General notifications',
    importance: modules.AndroidImportance.HIGH,
    vibration: true,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const modules = loadPushModules();
  if (!modules) return false;

  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
      }
    }

    const settings = await modules.notifee.requestPermission();
    return settings.authorizationStatus >= 1;
  } catch (e) {
    return false;
  }
}

export async function sendTokenToServer(fcmToken: string): Promise<void> {
  try {
    const session = await AuthService.getSession();

    if (!session || !session.user?.userid) {
      return;
    }

    const platform = Platform.OS ===
    'ios' ? 'ios' : 'android';
    const url = buildDeviceTokenUrl(platform, fcmToken, session.user.userid);

    const response = await fetch(url, {method: 'POST'});

    const responseText = await response.text();

  } catch (err) {
  }
}
let registering = false;
export async function registerDeviceForPush(): Promise<void> {
  const modules = loadPushModules();
  if (!modules) return;

  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    await ensureAndroidChannel();

    await modules.registerDeviceForRemoteMessages(modules.messagingInstance);

    const fcmToken = await modules.getToken(modules.messagingInstance);

    await sendTokenToServer(fcmToken);
  } catch (e: any) {
    console.warn('registerDeviceForPush error', e?.message ?? e);
  }
}

async function displayForegroundNotification(remoteMessage: any): Promise<void> {
  const modules = loadPushModules();
  if (!modules) return;

  const title =
    remoteMessage.notification?.title ??
    remoteMessage.data?.title ??
    'Skool 360';

  const body =
    remoteMessage.notification?.body ??
    remoteMessage.data?.body ??
    remoteMessage.data?.message ??
    '';

  await ensureAndroidChannel();

try {
  await modules.notifee.displayNotification({
    title,
    body,
    data: remoteMessage.data,
    android: {
      channelId: DEFAULT_CHANNEL_ID,
      pressAction: {
        id: 'default',
      },
      smallIcon: 'ic_launcher',
      color: '#4CAF50',
      largeIcon: 'ic_launcher',
    },
  });

} catch (e: any) {
    return;
  }

}
type NotificationTapHandler = (data: Record<string, string> | undefined) => void;


export function initNotifications(onNotificationTap: NotificationTapHandler): () => void {

  const modules = loadPushModules();
  if (!modules) return () => {};
  if (initialized) return () => {};
  initialized = true;

try {
    ensureAndroidChannel();
    const unsubscribeForeground = modules.onMessage(
        modules.messagingInstance,
        async (remoteMessage: any) => {
            await displayForegroundNotification(remoteMessage);
        },
    );

    const unsubscribeNotifeeForeground = modules.notifee.onForegroundEvent(
      ({type, detail}: any) => {
        if (type === modules.EventType.PRESS) {
          onNotificationTap(detail.notification?.data as Record<string, string> | undefined);
        }
      },
    );

    const unsubscribeOpenedApp = modules.onNotificationOpenedApp(
      modules.messagingInstance,
      (remoteMessage: any) => {
        onNotificationTap(remoteMessage.data as Record<string, string> | undefined);
      },
    );

    const unsubscribeTokenRefresh = modules.onTokenRefresh(
      modules.messagingInstance,
      (newToken: string) => {
        sendTokenToServer(newToken).catch(() => {});
      },
    );

      modules.getInitialNotification(modules.messagingInstance).then((remoteMessage: any) => {
      if (remoteMessage) {
        onNotificationTap(remoteMessage.data as Record<string, string> | undefined);
      }
    });
    return () => {
      unsubscribeForeground();
      unsubscribeNotifeeForeground();
      unsubscribeOpenedApp();
      unsubscribeTokenRefresh();
    };
  } catch (e) {
    return () => {};
  }
}