import {Platform, PermissionsAndroid} from 'react-native';
import {buildDeviceTokenUrl,buildDeviceTokenRemoveUrl} from './api';
import {AuthService} from './Authservice';
const DEFAULT_CHANNEL_ID = 'default';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
let initialized = false;

// Tapping a notification always opens this page (the Messages / Communication page)
export const COMMUNICATION_URL = 'https://edplex.skool360.com/Communication';

// The page to open once the dashboard has loaded. The WebView screen reads it with consumePendingRedirect().
let pendingRedirect: {url: string; at: number} | null = null;

function rememberRedirect(data?: Record<string, string>): void {
  const own = data && typeof data.redirectUrl === 'string' ? data.redirectUrl.trim() : '';
  pendingRedirect = {url: own || COMMUNICATION_URL, at: Date.now()};
}

// Returns the page to open (once), or undefined. A tap older than 2 minutes is ignored.
export function consumePendingRedirect(): string | undefined {
  const pending = pendingRedirect;
  pendingRedirect = null;
  if (!pending || Date.now() - pending.at > 120000) {
    return undefined;
  }
  return pending.url;
}

export async function removeTokenFromServer(): Promise<void> {
  sentForUserId = null; // after logout the next login must register the token again
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
      getAPNSToken,
    } = messagingModule;

    return {
      messagingInstance: getMessaging(),
      getToken,
      registerDeviceForRemoteMessages,
      onMessage,
      onNotificationOpenedApp,
      onTokenRefresh,
      getInitialNotification,
      getAPNSToken,
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

// On iOS the FCM token only exists after Apple has handed the app its APNs token, which can take a few
// seconds after start-up. Asking too early fails, so ask again a few times.
async function getFcmTokenWithRetry(modules: any): Promise<string> {
  const attempts = Platform.OS === 'ios' ? 10 : 1;
  let lastError: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      if (Platform.OS === 'ios' && typeof modules.getAPNSToken === 'function') {
        const apns = await modules.getAPNSToken(modules.messagingInstance);
        if (!apns) {
          throw new Error('APNs token not available yet');
        }
      }
      const token = await modules.getToken(modules.messagingInstance);
      if (token) {
        return token;
      }
      throw new Error('empty FCM token');
    } catch (e: any) {
      lastError = e;
      await sleep(1500);
    }
  }
  throw lastError ?? new Error('could not get the FCM token');
}

export async function sendTokenToServer(fcmToken: string): Promise<boolean> {
  try {
    const session = await AuthService.getSession();
    if (!session || !session.user?.userid) {
      return false;
    }

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const url = buildDeviceTokenUrl(platform, fcmToken, session.user.userid);

    const response = await fetch(url, {method: 'POST'});
    const responseText = await response.text();

    // the server answers 200 even when it refuses ("Authentication fail"), so look at the text as well
    return response.ok && !/fail|error|invalid/i.test(responseText);
  } catch (err) {
    return false;
  }
}
// registerDeviceForPush() is called from several places (app start, and every time the dashboard loads).
// Running it twice at the same moment makes iOS fail with "[messaging/registration-superseded]", so:
//  - calls made while one is already running share that run,
//  - Apple registration is done once per app run,
//  - a user whose token was already sent is not sent again.
let registrationInFlight: Promise<void> | null = null;
let remoteRegistered = false;
let sentForUserId: string | null = null;

export function registerDeviceForPush(): Promise<void> {
  if (!registrationInFlight) {
    registrationInFlight = doRegisterDeviceForPush().finally(() => {
      registrationInFlight = null;
    });
  }
  return registrationInFlight;
}

async function doRegisterDeviceForPush(): Promise<void> {
  const modules = loadPushModules();
  if (!modules) return;

  try {
    const granted = await requestNotificationPermission();
    if (!granted) {
      return;
    }

    await ensureAndroidChannel();

    const session = await AuthService.getSession();
    const userId: string | null = session?.user?.userid ?? null;
    if (userId && sentForUserId === userId) {
      return; // this user's token is already on the server
    }

    if (!remoteRegistered) {
      await modules.registerDeviceForRemoteMessages(modules.messagingInstance);
      remoteRegistered = true;
    }

    const fcmToken = await getFcmTokenWithRetry(modules);

    const sent = await sendTokenToServer(fcmToken);
    if (sent && userId) {
      sentForUserId = userId;
    }
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


export function initNotifications(onNotificationTapped: NotificationTapHandler): () => void {
  // every kind of tap: remember where to go, then let the app open the dashboard screen
  const onNotificationTap: NotificationTapHandler = data => {
    rememberRedirect(data);
    onNotificationTapped(data);
  };

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