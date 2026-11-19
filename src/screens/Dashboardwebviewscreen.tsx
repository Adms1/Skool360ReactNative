import React, {useEffect, useRef, useState} from 'react';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  ScrollView,
  TouchableOpacity,
  Modal,
  Linking,
  Alert,
  Platform,
  PermissionsAndroid,
  Image
} from 'react-native';
import {WebView as RNWebView, WebViewNavigation} from 'react-native-webview';

import RNPrint from 'react-native-print';
import RNFetchBlob from 'react-native-blob-util';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../services/Types';
import {API_CONFIG} from '../services/api';
import {registerDeviceForPush, consumePendingRedirect} from '../services/Notificationservice';
import {AuthService} from '../services/Authservice';
import {ToastAndroid} from 'react-native';
import OfflineView from './OfflineView';
import DashboardSkeleton from './DashboardSkeleton';
const WebView = RNWebView as any;

type Props = NativeStackScreenProps<RootStackParamList, 'DashboardWebView'>;

interface UserProfileOption {
  name: string;
  userType: string;
  schoolName: string;
}

interface DownloadState {
  visible: boolean;
  progress: number; // 0..1
  fileName: string;
  error: boolean;
}

const AUTH_TIMEOUT_MS = 15000;

// While testing "file is not saved in the phone's storage": shows what happened to each download.
// Set to false when it works.
const DEBUG_DOWNLOAD = false;

const PULL_TRIGGER_DISTANCE = 150;// drag past this to trigger a refresh
const PULL_MAX_DISTANCE = 150;    // resistance cap while dragging
const PULL_SETTLE_DISTANCE = 56;  // where the indicator sits while refreshing



import {
  DOWNLOADABLE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  MIME_TYPES,
  getFileNameFromUrl,
  getExtension,
  guessMimeType,
  looksLikeDownload,
  looksLikeVideo,
  resolveIntentUrl,
} from './DashboardHelpers';
import {
  buildLoginInjection,
  PULL_REFRESH_INJECTION,
  buildSelectUserInjection,
  PRINT_OVERRIDE_INJECTION,
  MODAL_CONTROL,
  UPI_INTERCEPT_INJECTION,
  DISABLE_ZOOM_INJECTION,
  IOS_FAST_TAP_INJECTION,
  EXPORT_INTERCEPT_INJECTION,
  FILE_LINK_INJECTION,
  IOS_EDGE_SWIPE_INJECTION,
} from './DashboardInjections';
// Blocks pinch-zoom and double-tap zoom inside the page (runs before the page loads and again after)
const NO_ZOOM_INJECTION = `
(function () {
  var CONTENT = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no';

  function lockViewport() {
    var m = document.querySelector('meta[name=viewport]');
    if (!m) {
      m = document.createElement('meta');
      m.name = 'viewport';
      (document.head || document.documentElement).appendChild(m);
    }
    if (m.getAttribute('content') !== CONTENT) { m.setAttribute('content', CONTENT); }
  }
  lockViewport();

  if (!window.__noZoom) {
    window.__noZoom = true;

    // keep the viewport locked even if the site rewrites its meta tag
    try {
      new MutationObserver(lockViewport).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['content']
      });
    } catch (e) {}

    // pan/scroll only: no pinch or double-tap zoom gestures
    var st = document.createElement('style');
    st.textContent = 'html, body { touch-action: pan-x pan-y !important; }';
    (document.head || document.documentElement).appendChild(st);

    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
      document.addEventListener(t, function (e) { e.preventDefault(); }, {passive: false});
    });
    document.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length > 1) { e.preventDefault(); }
    }, {passive: false});
    document.addEventListener('wheel', function (e) {
      if (e.ctrlKey) { e.preventDefault(); }
    }, {passive: false});
  }

  // Single-finger only: ignore every touch while 2 or more fingers are down
  if (!window.__singleTouch) {
    window.__singleTouch = true;
    var multi = false;

    function block(e) {
      e.stopImmediatePropagation();
      e.stopPropagation();
      if (e.cancelable) { e.preventDefault(); }
    }

    ['touchstart', 'touchmove'].forEach(function (type) {
      window.addEventListener(type, function (e) {
        if (e.touches && e.touches.length > 1) { multi = true; }
        if (multi) { block(e); }
      }, {capture: true, passive: false});
    });

    ['touchend', 'touchcancel'].forEach(function (type) {
      window.addEventListener(type, function (e) {
        if (multi) { block(e); }
        if (!e.touches || e.touches.length === 0) {
          // keep blocking the "click" that follows a multi-finger touch, then reset
          setTimeout(function () { multi = false; }, 350);
        }
      }, {capture: true, passive: false});
    });

    // taps/clicks that come out of a multi-finger gesture are dropped
    ['click', 'dblclick', 'contextmenu'].forEach(function (type) {
      window.addEventListener(type, function (e) { if (multi) { block(e); } }, true);
    });

    // extra fingers are not primary pointers
    ['pointerdown', 'pointermove', 'pointerup'].forEach(function (type) {
      window.addEventListener(type, function (e) {
        if (e.pointerType === 'touch' && e.isPrimary === false) { block(e); }
      }, true);
    });
  }
})();
true;
`;

const DashboardWebViewScreen: React.FC<Props> = ({route, navigation}) => {
  const {username, password} = route.params;
    const insets = useSafeAreaInsets();
  const webViewRef = useRef<any>(null);

  // Only ever hand the WebView a non-empty string. If a script constant is missing (undefined/null),
  // iOS fails with "injectJavaScript received 1st argument of type NSNull, expected string".
  // A function may be passed so that a failing script builder is caught as well.
  const safeInject = (script: string | (() => string) | null | undefined, label: string = 'script') => {
    let code: unknown = script;
    try {
      if (typeof script === 'function') {
        code = script();
      }
    } catch (e) {
      code = undefined;
    }
    if (typeof code !== 'string' || code.length === 0) {
      if (__DEV__) {
        console.warn('[WebView] injectJavaScript skipped: ' + label + ' is ' + String(code));
      }
      return;
    }
    webViewRef.current?.injectJavaScript(code);
  };
  const canGoBackRef = useRef(false);
  const canGoForwardRef = useRef(false);
  const reachedDashboardRef = useRef(false);
  const attemptedAutoLoginRef = useRef(false);
  const loggedOutRef = useRef(false);
  const paymentFlowRef = useRef(false);  // user is out paying (UPI app / payment gateway)
  const reloginTriedRef = useRef(false); // silent sign-in after a payment is tried only once
  const [authenticating, setAuthenticating] = useState(true);
  const [userOptions, setUserOptions] = useState<UserProfileOption[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadErrorRef = useRef(false);

  const pullAnim = useRef(new Animated.Value(0)).current;
  const lastPullDyRef = useRef(0);
  const [downloadState, setDownloadState] = useState<DownloadState>({
    visible: false,
    progress: 0,
    fileName: '',
    error: false,
  });

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const currentUrlRef = useRef(API_CONFIG.DASHBOARD_URL);
  const [isOnDashboard, setIsOnDashboard] = useState(false);
  const showSplash = authenticating && !userOptions;
  const springTo = (toValue: number) => {
    Animated.spring(pullAnim, {toValue, useNativeDriver: true, friction: 8}).start();
  };
  const triggerRefresh = () => {
    setRefreshing(true);
    springTo(PULL_SETTLE_DISTANCE);
    webViewRef.current?.reload();
  };
  const hideWebView = authenticating || userOptions !== null;
  // Universal UPI opener with fallback for Google Pay / PhonePe / Paytm
  const openUpiPayment = async (rawUrl: string) => {
    if (!rawUrl) return;
    paymentFlowRef.current = true;
    const targetUrl =
      rawUrl.startsWith('intent://') || rawUrl.startsWith('intent:')
        ? resolveIntentUrl(rawUrl)
        : rawUrl;

    try {
      await Linking.openURL(targetUrl);
    } catch (e1) {
      try {
        const gpayUrl = targetUrl.replace(/^upi:\/\//i, 'gpay://upi/');
        await Linking.openURL(gpayUrl);
      } catch (e2) {
        try {
          const phonepeUrl = targetUrl.replace(/^upi:\/\//i, 'phonepe://');
          await Linking.openURL(phonepeUrl);
        } catch (e3) {
          try {
            const paytmUrl = targetUrl.replace(/^upi:\/\//i, 'paytmmp://');
            await Linking.openURL(paytmUrl);
          } catch (e4) {
            Alert.alert(
              'No UPI App Found',
              'Please ensure Google Pay, PhonePe, or Paytm is installed and has permission to open links.',
            );
          }
        }
      }
    }
  };
// Small message for the user. Android: the system toast. iOS has none, so a pill is drawn at the bottom.
// "busy" keeps it (with a spinner) until hideToast() is called - used while a file is being fetched.
const [toastInfo, setToastInfo] = useState<{text: string; busy: boolean} | null>(null);
const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const hideToast = () => {
  if (toastTimerRef.current) {
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
  }
  setToastInfo(null);
};
const showToast = (message: string, busy: boolean = false) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  setToastInfo({text: message, busy});
  // a busy message is removed by the code that finishes the job; this is only a safety net
  toastTimerRef.current = setTimeout(() => setToastInfo(null), busy ? 60000 : 2500);
};
useEffect(() => () => {
  if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
}, []);
  const requestStoragePermissionIfNeeded = async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || Platform.Version >= 29) return true;
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };

  // ---- Saving files so that they show up in the phone's "Files" app (Downloads folder) ----

  const debugDownload = (title: string, info: Record<string, unknown>) => {
    console.log('[DOWNLOAD] ' + title, JSON.stringify(info));
    if (DEBUG_DOWNLOAD) {
      Alert.alert('Download: ' + title, JSON.stringify(info, null, 2));
    }
  };

  const safeFileName = (name: string) =>
    String(name || 'download').replace(/[\\/:*?"<>|]/g, '_').trim() || 'download';

  // "report.xlsx" -> "report (1).xlsx" when a file with that name is already in Downloads
  const uniqueDownloadName = async (fileName: string): Promise<string> => {
    const {fs} = RNFetchBlob;
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : '';
    let name = fileName;
    for (let i = 1; i <= 50; i++) {
      let taken = false;
      try {
        taken = await fs.exists(`${fs.dirs.DownloadDir}/${name}`);
      } catch {}
      if (!taken) break;
      name = `${base} (${i})${ext}`;
    }
    return name;
  };

  // Moves a finished file from the app's private cache into the public Downloads folder.
  // Android 10+: through MediaStore (the only way the file is listed in the Files app).
  // Older Android: copy into Downloads and register it.
  const publishToDownloads = async (cachePath: string, fileName: string, mime: string) => {
    const {fs} = RNFetchBlob;
    let publishedHow = 'legacy copy';
    const type = mime || guessMimeType(fileName);

    if (Platform.OS !== 'android') {
      const path = `${fs.dirs.DocumentDir}/${fileName}`;
      await fs.cp(cachePath, path);
      hideToast();
      await RNFetchBlob.ios.previewDocument(path);
      return;
    }

    if (Platform.Version >= 29 && RNFetchBlob.MediaCollection?.copyToMediaStore) {
      await RNFetchBlob.MediaCollection.copyToMediaStore(
        {name: fileName, parentFolder: '', mimeType: type},
        'Download',
        cachePath,
      );
      try {
        await fs.unlink(cachePath);
      } catch {}
      publishedHow = 'MediaStore';
      // best effort: the usual "Download complete" notification (tap = open the file)
      try {
        await RNFetchBlob.android.addCompleteDownload({
          title: fileName,
          description: 'Downloaded',
          mime: type,
          path: `${fs.dirs.DownloadDir}/${fileName}`,
          showNotification: true,
        });
      } catch {}
      debugDownload('saved (' + publishedHow + ')', {api: Platform.Version, file: fileName, folder: 'Downloads'});
      return;
    }

    const finalName = await uniqueDownloadName(fileName);
    const path = `${fs.dirs.DownloadDir}/${finalName}`;
    await fs.cp(cachePath, path);
    try {
      await fs.unlink(cachePath);
    } catch {}
    await fs.scanFile([{path, mime: type}]);
    await RNFetchBlob.android.addCompleteDownload({
      title: finalName,
      description: 'Downloaded',
      mime: type,
      path,
      showNotification: true,
    });
    debugDownload('saved (' + publishedHow + ')', {api: Platform.Version, file: finalName, path});
  };

  const downloadFileNow = async (url: string, nameHint?: string) => {
    if (!url) return;

    const granted = await requestStoragePermissionIfNeeded();
    if (!granted) {
      Alert.alert('Permission required', 'Storage permission is needed to save the file.');
      return;
    }

    const fileName = getFileNameFromUrl(url, nameHint);
    const mimeType = guessMimeType(fileName);

   if (Platform.OS === 'android') {
     const {fs} = RNFetchBlob;
     const name = safeFileName(fileName);
     showToast('Downloading...');

     // 1) Android 10+: download into the app's cache, then publish through MediaStore.
     //    This is the way that makes the file appear in the Files app (Downloads folder).
     if (Platform.Version >= 29 && RNFetchBlob.MediaCollection?.copyToMediaStore) {
       const cachePath = `${fs.dirs.CacheDir}/${Date.now()}_${name}`;
       try {
         const res = await RNFetchBlob.config({path: cachePath}).fetch('GET', url);
         const status = res.info().status;
         if (status < 200 || status >= 300) {
           throw new Error('HTTP ' + status);
         }
         await publishToDownloads(cachePath, name, mimeType);
         showToast('Saved to Downloads');
         return;
       } catch (e: any) {
         debugDownload('MediaStore save failed, trying the download manager', {
           api: Platform.Version,
           error: String(e?.message ?? e),
         });
         try {
           await fs.unlink(cachePath);
         } catch {}
       }
     } else {
       debugDownload('MediaStore not available, using the download manager', {
         api: Platform.Version,
         mediaCollection: !!RNFetchBlob.MediaCollection,
       });
     }

     // 2) the system download manager, straight into the public Downloads folder
     try {
       const finalName = await uniqueDownloadName(name);
       const target = `${fs.dirs.DownloadDir}/${finalName}`;
       const res = await RNFetchBlob.config({
         addAndroidDownloads: {
           useDownloadManager: true,
           notification: true,
           title: finalName,
           description: 'Downloading file',
           mime: mimeType,
           mediaScannable: true,
           path: target,
         },
       }).fetch('GET', url);
       showToast('Downloaded');
       debugDownload('saved (download manager)', {
         api: Platform.Version,
         target,
         reportedPath: typeof res?.path === 'function' ? res.path() : undefined,
       });
     } catch (error: any) {
       showToast('Download failed');
       debugDownload('FAILED', {api: Platform.Version, error: String(error?.message ?? error)});
     }
     return;
   }

    // iOS — no system "download manager" exists; Quick Look is the native equivalent.
    // The system sheet (Copy / Quick Look / Save to Files) only appears once the file is here, so show a
    // message right away, otherwise the user thinks nothing happened and taps again.
    showToast('Downloading...', true);
    try {
      const {fs} = RNFetchBlob;
      const filePath = `${fs.dirs.DocumentDir}/${safeFileName(fileName)}`;

      // straight into a file (no big base64 string in memory)
      const res = await RNFetchBlob.config({path: filePath}).fetch('GET', url);
      const status = res.info().status;
      if (status < 200 || status >= 300) {
        throw new Error(`HTTP ${status}`);
      }

      hideToast();
      await RNFetchBlob.ios.previewDocument(filePath);
    } catch (error) {
      hideToast();
      // Only remaining UI on iOS: a native system alert, only on real failure.
      Alert.alert('Download failed', 'Could not download this file. Please try again.');
    }
  };

  // The same file tapped again while it is still downloading is ignored (no duplicate downloads)
  const downloadsInFlightRef = useRef<Set<string>>(new Set());
  const downloadFile = async (url: string, nameHint?: string) => {
    if (!url || downloadsInFlightRef.current.has(url)) return;
    downloadsInFlightRef.current.add(url);
    try {
      await downloadFileNow(url, nameHint);
    } finally {
      downloadsInFlightRef.current.delete(url);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!reachedDashboardRef.current) {
        setAuthenticating(false);
      }
    }, AUTH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
useEffect(() => {
  SystemNavigationBar.setNavigationColor('#d5e1f9', 'dark', 'navigation');
}, []);
  useEffect(() => {
      if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (videoUrl) {
        setVideoUrl(null);
        return true;
      }
      if (canGoBackRef.current && !currentUrlRef.current?.includes('/Dashboard')) {
            webViewRef.current?.goBack();
            return true;
          }
          return false;
    });
    return () => subscription.remove();
  }, [videoUrl]);
const redirectToLogin = () => {
  if (loggedOutRef.current) return;
  loggedOutRef.current = true;
  navigation.reset({index: 0, routes: [{name: 'Login'}]});
  AuthService.logout().catch(() => {});
};

// Only the page address counts: "?ReturnUrl=...login..." in the query string does not
const isLoginPageUrl = (url: string) =>
  url.split('#')[0].split('?')[0].toLowerCase().includes('login');

// After a payment the gateway sends the user back to the site, and the site may have lost
// the session and show its login page. Instead of logging the user out, sign in again silently
// with the saved credentials (once).
const startSilentRelogin = () => {
  reloginTriedRef.current = true;
  reachedDashboardRef.current = false;
  attemptedAutoLoginRef.current = false;
  setAuthenticating(true);
};

// Returns true when the login page may load (silent sign-in), false when the user is logged out
const onLoginPageReached = (): boolean => {
  if (paymentFlowRef.current && !reloginTriedRef.current) {
    startSilentRelogin();
    return true;
  }
  redirectToLogin();
  return false;
};
  const handleNavStateChange = (navState: WebViewNavigation) => {
     canGoBackRef.current = navState.canGoBack;
     canGoForwardRef.current = !!navState.canGoForward;
      currentUrlRef.current = navState.url;
      setIsOnDashboard(navState.url.includes('/Dashboard'));
    if (navState.url.includes('/Dashboard') && !navState.loading) {
      if (!reachedDashboardRef.current) {
        reachedDashboardRef.current = true;
        paymentFlowRef.current = false;
        reloginTriedRef.current = false;
        loggedOutRef.current = false;
        registerDeviceForPush();
        goToPendingRedirect();
      }
      setAuthenticating(false);
      setUserOptions(null);
      return;
    }

  if (reachedDashboardRef.current && isLoginPageUrl(navState.url)) {
    onLoginPageReached();
  }
  };
useEffect(() => {
  if (!errorMsg) return;
  const t = setTimeout(() => setErrorMsg(null), 6000);
  return () => clearTimeout(t);
}, [errorMsg]);
const handleRetry = () => {
  loadErrorRef.current = false;
  setLoadError(null);
  if (!reachedDashboardRef.current) setAuthenticating(true);
  webViewRef.current?.reload();
};
  const handleLoadEnd = (event: any) => {
      if (loadErrorRef.current) return;
    if (refreshing) {
      setRefreshing(false);
      springTo(0);
    }
    safeInject(PULL_REFRESH_INJECTION, 'PULL_REFRESH_INJECTION');
    safeInject(PRINT_OVERRIDE_INJECTION, 'PRINT_OVERRIDE_INJECTION');
    safeInject(UPI_INTERCEPT_INJECTION, 'UPI_INTERCEPT_INJECTION');
    safeInject(MODAL_CONTROL, 'MODAL_CONTROL');
    safeInject(DISABLE_ZOOM_INJECTION, 'DISABLE_ZOOM_INJECTION');
    safeInject(NO_ZOOM_INJECTION, 'NO_ZOOM_INJECTION');
    safeInject(IOS_FAST_TAP_INJECTION, 'IOS_FAST_TAP_INJECTION');
      safeInject(EXPORT_INTERCEPT_INJECTION, 'EXPORT_INTERCEPT_INJECTION');
    safeInject(FILE_LINK_INJECTION, 'FILE_LINK_INJECTION');
    if (Platform.OS === 'ios') {
      safeInject(IOS_EDGE_SWIPE_INJECTION, 'IOS_EDGE_SWIPE_INJECTION');
    }
    const loadedUrl: string = event?.nativeEvent?.url ?? '';
    const onDashboard = reachedDashboardRef.current || loadedUrl.includes('/Dashboard');
    if (onDashboard) {
      if (!reachedDashboardRef.current) {
        reachedDashboardRef.current = true;
        paymentFlowRef.current = false;
        reloginTriedRef.current = false;
        loggedOutRef.current = false;
        registerDeviceForPush();
        goToPendingRedirect();
      }
      setAuthenticating(false);
      return;
    }

    if (!attemptedAutoLoginRef.current) {
      attemptedAutoLoginRef.current = true;
      safeInject(() => buildLoginInjection(username, password), 'buildLoginInjection');
    }
  };
// A file that arrives from the page as one base64 string
const saveBase64File = async (fileName: string, mime: string, data: string) => {
  const granted = await requestStoragePermissionIfNeeded();
  if (!granted) {
    Alert.alert('Permission required', 'Storage permission is needed to save the file.');
    return;
  }
  try {
    const {fs} = RNFetchBlob;
    const name = safeFileName(fileName);
    const cachePath = `${fs.dirs.CacheDir}/${Date.now()}_${name}`;
    showToast('Downloading...');
    await fs.writeFile(cachePath, data, 'base64');
    await publishToDownloads(cachePath, name, mime);
    showToast('Downloaded');
  } catch {
    hideToast();
    Alert.alert('Download failed', 'Could not save this file. Please try again.');
  }
};

// A file that arrives from the page in small pieces (FILE_START / FILE_CHUNK / FILE_END)
const fileJobRef = useRef<{
  id: string;
  cachePath: string;
  fileName: string;
  mime: string;
  started: boolean;
  failed: boolean;
  chain: Promise<void>;
} | null>(null);

const failFileJob = (job: {failed: boolean}, message: string) => {
  if (job.failed) return;
  job.failed = true;
  hideToast();
  Alert.alert('Download failed', message);
};

const startFileJob = (p: any) => {
  const {fs} = RNFetchBlob;
  const fileName = safeFileName(p.fileName || 'export.xlsx');
  const job = {
    id: String(p.id),
    fileName,
    mime: String(p.mime || ''),
    cachePath: `${fs.dirs.CacheDir}/${Date.now()}_${fileName}`,
    started: false,
    failed: false,
    chain: Promise.resolve(),
  };
  fileJobRef.current = job;
  job.chain = requestStoragePermissionIfNeeded().then(granted => {
    if (!granted) {
      failFileJob(job, 'Storage permission is needed to save the file.');
    }
  });
};

const appendFileChunk = (p: any) => {
  const job = fileJobRef.current;
  if (!job || job.id !== String(p.id)) return;
  job.chain = job.chain.then(async () => {
    if (job.failed) return;
    try {
      const {fs} = RNFetchBlob;
      if (!job.started) {
        job.started = true;
        await fs.writeFile(job.cachePath, p.data, 'base64');
      } else {
        await fs.appendFile(job.cachePath, p.data, 'base64');
      }
    } catch {
      failFileJob(job, 'Could not save this file. Please try again.');
    }
  });
};

const finishFileJob = (p: any) => {
  const job = fileJobRef.current;
  if (!job || job.id !== String(p.id)) return;
  job.chain = job.chain.then(async () => {
    if (job.failed) return;
    try {
      const {fs} = RNFetchBlob;
      if (!job.started) {
        await fs.writeFile(job.cachePath, '', 'utf8'); // empty file
      }
      await publishToDownloads(job.cachePath, job.fileName, job.mime);
      showToast('Downloaded');
    } catch {
      failFileJob(job, 'Could not save this file. Please try again.');
    } finally {
      if (fileJobRef.current === job) fileJobRef.current = null;
    }
  });
};
  const handleMessage = (event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);

      if (payload?.type === 'DOWNLOAD_FILE') {
        if (payload.url) {
          downloadFile(String(payload.url), payload.name ? String(payload.name) : undefined);
        }
        return;
      }
      if (payload?.type === 'OPEN_DEEP_LINK') {
        openUpiPayment(payload.url);
        return;
      }
      if (payload?.type === 'BOOK_FILE') {
        const url: string = payload.url || '';
        if (!url) return;
        const mime: string = (payload.mime || '').toLowerCase();
        const dtype: string = (payload.dtype || '').toLowerCase();
        const isVideo = mime.startsWith('video') || dtype === 'video' || looksLikeVideo(url);
        if (isVideo) {
          setVideoUrl(url);
        } else {
          downloadFile(url);
        }
        return;
      }
  if (payload?.type === 'SWIPE_BACK') {
    if (videoUrl) {
      setVideoUrl(null);
    } else if (canGoBackRef.current && !currentUrlRef.current?.includes('/Dashboard')) {
      webViewRef.current?.goBack();
    }
    return;
  }
  if (payload?.type === 'SWIPE_FORWARD') {
    if (canGoForwardRef.current) {
      webViewRef.current?.goForward();
    }
    return;
  }
  if (payload?.type === 'FILE_BASE64') {
    saveBase64File(payload.fileName, payload.mime, payload.data);
    return;
  }
  if (payload?.type === 'EXPORT_START') {
    showToast('Preparing your file...', true);
    return;
  }
  if (payload?.type === 'EXPORT_END') {
    hideToast();
    return; // the page handled it itself (not a file)
  }
  if (payload?.type === 'EXPORT_ERROR') {
    hideToast();
    Alert.alert('Export failed', 'Could not prepare the file. Please try again.');
    return;
  }
  if (payload?.type === 'FILE_START') {
    startFileJob(payload);
    return;
  }
  if (payload?.type === 'FILE_CHUNK') {
    appendFileChunk(payload);
    return;
  }
  if (payload?.type === 'FILE_END') {
    finishFileJob(payload);
    return;
  }
      if (payload?.type === 'SELECT_USER_OPTIONS') {
        setUserOptions(payload.options);
        setErrorMsg(null);
        return;
      }
      if (payload?.type === 'LOGIN_FAILED') {
        setErrorMsg(payload.reason || 'Sign-in failed. Please try again.');
        setAuthenticating(false);
        return;
      }
      if (payload?.type === 'INJECT_ERROR') {
        // The silent sign-in ran on a page that has no login form (e.g. "Payment Failed"),
        // which means the user is still signed in. Nothing to fix, so show no error.
        if (payload.reason === 'fields-not-found' && reloginTriedRef.current) {
          reachedDashboardRef.current = true;
          reloginTriedRef.current = false;
          paymentFlowRef.current = false;
          setAuthenticating(false);
          setErrorMsg(null);
          return;
        }
        setErrorMsg(
          'Could not sign in automatically (' +
            (payload.reason || 'unknown') +
            '). Please log in below.',
        );
        setAuthenticating(false);
        return;
      }
      if (payload?.type === 'PULL_MOVE') {
        if (!refreshing) {
          lastPullDyRef.current = payload.dy;
          pullAnim.setValue(Math.min(payload.dy, PULL_MAX_DISTANCE));
        }
        return;
      }
      if (payload?.type === 'PULL_END') {
        if (!refreshing) {
          if (lastPullDyRef.current > PULL_TRIGGER_DISTANCE) {
            triggerRefresh();
          } else {
            springTo(0);
          }
        }
        lastPullDyRef.current = 0;
        return;
      }
      if (payload?.type === 'PRINT_REQUEST') {
        RNPrint.print({html: payload.html}).catch((err: any) => {
        });
        return;
      }
    } catch {
      // ignore non-JSON messages
    }
  };

  // Open the page a tapped notification points to (only our own / trusted addresses)
  const goToPendingRedirect = () => {
    const target = consumePendingRedirect();
    if (!target || !isTrustedUrl(target) || isLoginPageUrl(target)) {
      return;
    }
    safeInject(`window.location.href = ${JSON.stringify(target)}; true;`, 'notification redirect');
  };

  const handleSelectProfile = (index: number) => {
    setUserOptions(null);
    setAuthenticating(true);
    safeInject(() => buildSelectUserInjection(index), 'buildSelectUserInjection');
  };

  // Domains that must always stay INSIDE the WebView
  const TRUSTED_DOMAINS = [
    'edplex.skool360.com',
    'skool360.com',
    'razorpay.com',
    'api.razorpay.com',
    'checkout.razorpay.com',
    'billdesk.com',
    'pgbilldesk.com',
    'payu.in',
    'secure.payu.in',
    'payumoney.com',
    'ccavenue.com',
    'paytm.com',
    'secure.paytm.in',
    'easebuzz.in',
    'pay.easebuzz.in',
    'getepay.in',
    'sbi.co.in',
    'sbipay.in',
    'kotakpay.com',
    'axis.bank',
    'hdfcbank.com',
    'icicibank.com',
  ];

  // Payment gateways / banks (everything in the list after the two skool360 domains)
  const isPaymentUrl = (url: string): boolean => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return TRUSTED_DOMAINS.slice(2).some(d => host === d || host.endsWith('.' + d));
    } catch {
      return false;
    }
  };

  const isTrustedUrl = (url: string): boolean => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return TRUSTED_DOMAINS.some(domain => host === domain || host.endsWith('.' + domain));
    } catch {
      return false;
    }
  };

 const handleShouldStartLoadWithRequest = (request: any): boolean => {
   const url: string = request?.url || '';

   if (isPaymentUrl(url)) {
     paymentFlowRef.current = true;
   }

   if (reachedDashboardRef.current && isLoginPageUrl(url)) {
     return onLoginPageReached();
   }
    // 1. Non-http schemes → UPI / payment app deep links
    if (
      !url.startsWith('http://') &&
      !url.startsWith('https://') &&
      !url.startsWith('about:') &&
      !url.startsWith('data:')
    ) {
      openUpiPayment(url);
      return false;
    }

    // a link to a file (image, audio, video, document ...) downloads instead of opening
    if (looksLikeDownload(url)) {
      downloadFile(url);
      return false;
    }
    if (isTrustedUrl(url)) {
      return true;
    }
    Linking.openURL(url).catch(() => {});
    return false;
  };

  const handleOpenWindow = (event: any) => {
    const targetUrl = event?.nativeEvent?.targetUrl;
    if (targetUrl) {
      if (
        !targetUrl.startsWith('http://') &&
        !targetUrl.startsWith('https://') &&
        !targetUrl.startsWith('about:') &&
        !targetUrl.startsWith('data:')
      ) {
        openUpiPayment(targetUrl);
        return;
      }
      // a link to a file (image, audio, video, document ...) downloads instead of opening
      if (looksLikeDownload(targetUrl)) {
        downloadFile(targetUrl);
        return;
      }
      safeInject(`window.location.href = ${JSON.stringify(targetUrl)}; true;`, 'open-window redirect');
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <WebView
        ref={webViewRef}
        source={{uri: API_CONFIG.DASHBOARD_URL}}
         textZoom={100}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        injectedJavaScriptBeforeContentLoaded={NO_ZOOM_INJECTION}
        allowsBackForwardNavigationGestures={false}
        originWhitelist={['*']}
        onNavigationStateChange={handleNavStateChange}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onOpenWindow={handleOpenWindow}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onFileDownload={({nativeEvent: {downloadUrl}}: any) => {
          if (looksLikeVideo(downloadUrl)) {
            setVideoUrl(downloadUrl);
          } else {
            downloadFile(downloadUrl);
          }
        }}
       onError={(syntheticEvent: any) => {
         const {url: failingUrl = '', description = ''} = syntheticEvent?.nativeEvent || {};
         if (
           failingUrl.startsWith('upi://') ||
           failingUrl.startsWith('intent://') ||
           failingUrl.startsWith('gpay://') ||
           failingUrl.startsWith('phonepe://') ||
           failingUrl.startsWith('paytmmp://')
         ) {
           openUpiPayment(failingUrl);
           return;
         }
         loadErrorRef.current = true;
         setAuthenticating(false);
         setLoadError(
           /INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|TIMED_OUT|NETWORK/i.test(description)
             ? 'No internet connection'
             : 'Something went wrong',
         );
       }}
        setSupportMultipleWindows={true}
        javaScriptCanOpenWindowsAutomatically={true}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        pullToRefreshEnabled={false}
        style={hideWebView ? styles.hidden : styles.visible}
      />
            {!hideWebView && (
              <View style={{height: insets.bottom, backgroundColor: '#d5e1f9'}} />
            )}
        {showSplash && <DashboardSkeleton />}
    {!!loadError && <OfflineView title={loadError} onRetry={handleRetry} />}
      {!hideWebView && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pullIndicator,
            {
              top: insets.top,
              transform: [
                {
                  translateY: pullAnim.interpolate({
                    inputRange: [0, PULL_SETTLE_DISTANCE, PULL_MAX_DISTANCE],
                    outputRange: [-50, 12, 28],
                    extrapolate: 'clamp',
                  }),
                },
              ],
              opacity: pullAnim.interpolate({
                inputRange: [0, 20, PULL_MAX_DISTANCE],
                outputRange: [0, 1, 1],
                extrapolate: 'clamp',
              }),
            },
          ]}>
          <View style={styles.pullCircle}>
            <ActivityIndicator size="small" color="#111111" />
          </View>
        </Animated.View>
      )}

      <Modal visible={!!userOptions} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.selectOverlay}>
          <ScrollView contentContainerStyle={styles.selectScrollContent}>
            {userOptions?.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={styles.selectCard}
                activeOpacity={0.7}
                onPress={() => handleSelectProfile(index)}>
                <View style={styles.selectAvatar}>
                  <Text allowFontScaling={false} style={styles.selectAvatarText}>{'\u{1F464}'}</Text>
                </View>
                <View style={styles.selectCardBody}>
                  <Text allowFontScaling={false} style={styles.selectName}>{option.name}</Text>
                  {!!option.userType && <Text allowFontScaling={false} style={styles.selectMeta}>{option.userType}</Text>}
                  {!!option.schoolName && (
                    <Text allowFontScaling={false} style={styles.selectMeta}>{option.schoolName}</Text>
                  )}
                </View>
                <Text allowFontScaling={false} style={styles.selectChevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={downloadState.visible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={styles.downloadCard}>
            <Text allowFontScaling={false} style={styles.downloadFileName} numberOfLines={1}>
              {downloadState.fileName}
            </Text>
            {downloadState.error ? (
              <Text allowFontScaling={false} style={styles.downloadErrorText}>Download failed</Text>
            ) : (
              <>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {width: `${Math.round(downloadState.progress * 100)}%`},
                    ]}
                  />
                </View>
                <Text allowFontScaling={false} style={styles.progressLabel}>
                  {downloadState.progress >= 1
                    ? 'Downloaded'
                    : `${Math.round(downloadState.progress * 100)}%`}
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!videoUrl}
        animationType="slide"
        onRequestClose={() => setVideoUrl(null)}>
        <View style={styles.videoContainer}>
          <TouchableOpacity onPress={() => setVideoUrl(null)} style={styles.videoCloseBtn}>
            <Text allowFontScaling={false} style={styles.videoCloseText}>{'\u2715'}  Close</Text>
          </TouchableOpacity>
          {videoUrl && (
            <WebView
              source={{uri: videoUrl}}
              style={styles.videoWebView}
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
            />
          )}
        </View>
      </Modal>

      {toastInfo && (
        <View pointerEvents="none" style={styles.toastWrap}>
          <View style={styles.toastPill}>
            {toastInfo.busy && <ActivityIndicator size="small" color="#ffffff" style={{marginRight: 10}} />}
            <Text allowFontScaling={false} style={styles.toastText}>{toastInfo.text}</Text>
          </View>
        </View>
      )}

      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text allowFontScaling={false} style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const NAVY = '#173a9c';
const BLUE = '#3b82f6';
const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: BLUE,
  },
  visible: {
    flex: 1,
  },
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  overlayText: {
    marginTop: 12,
    color: BLUE,
    fontSize: 14,
    fontWeight: '600',
  },
  selectOverlay: {
    flex: 1,
    backgroundColor: BLUE,
  },
  selectScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  selectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  selectAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eef1fb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  selectAvatarText: {
    fontSize: 22,
  },
  selectCardBody: {
    flex: 1,
  },
  selectName: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
    marginBottom: 3,
  },
  selectMeta: {
    fontSize: 12.5,
    color: '#6b7494',
    marginTop: 1,
  },
  selectChevron: {
    fontSize: 24,
    color: '#c3c9e0',
    marginLeft: 8,
  },
  downloadCard: {
    width: '80%',
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  downloadFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: NAVY,
    marginBottom: 14,
    textAlign: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#eef1fb',
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: NAVY,
  },
  progressLabel: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7494',
    textAlign: 'center',
  },
  downloadErrorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b3261e',
    textAlign: 'center',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoCloseBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  videoCloseText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  videoWebView: {
    flex: 1,
    backgroundColor: '#000000',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fdecea',
    padding: 12,
  },
  errorText: {
    color: '#b3261e',
    fontSize: 12,
  },
  pullIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  pullCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
skeletonScreen: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: '#f2f5fb',
  zIndex: 50,
},
skeletonHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  height: 60,
  paddingHorizontal: 16,
  backgroundColor: BLUE,
},
skeletonHeaderIcon: {
  width: 32,
  height: 32,
  borderRadius: 16,
  marginRight: 12,
  backgroundColor: 'rgba(255,255,255,0.35)',
},
skeletonYearPill: {
  width: 92,
  height: 30,
  borderRadius: 10,
  backgroundColor: 'rgba(255,255,255,0.35)',
},
skeletonHeaderSpacer: {
  flex: 1,
},
skeletonGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  paddingHorizontal: 16,
  paddingTop: 16,
},
skeletonTile: {
  width: '48%',
  height: 118,
  borderRadius: 14,
  marginBottom: 14,
  padding: 16,
  justifyContent: 'flex-end',
  backgroundColor: '#dde3f0',
},
skeletonTileIcon: {
  width: 36,
  height: 36,
  borderRadius: 18,
  marginBottom: 12,
  backgroundColor: '#cbd3e6',
},
skeletonTileLine: {
  width: '70%',
  height: 12,
  borderRadius: 6,
  backgroundColor: '#cbd3e6',
},
toastWrap: {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 40,
  alignItems: 'center',
  zIndex: 100,
},
toastPill: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 18,
  paddingVertical: 11,
  borderRadius: 22,
  backgroundColor: 'rgba(23,26,38,0.92)',
},
toastText: {
  color: '#ffffff',
  fontSize: 14,
  fontWeight: '600',
},
splashOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: '#ffffff',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
},
splashLogo: {
  width: 120,
  height: 120,
  marginBottom: 24,
},
splashTitle: {
  color: NAVY,
  fontSize: 15,
  fontWeight: '600',
  marginBottom: 14,
},
dotsRow: {
  flexDirection: 'row',
  gap: 8,
},
dot: {
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: NAVY,
},
 orgName: {
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 24,
    fontSize: 22,
    color: '#1b5e3b',
    fontFamily: Platform.select({ios: 'Georgia', android: 'serif'}),
  },
errorScreen: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: '#ffffff',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 30,
  zIndex: 60,
},
errorTitle: {
  color: NAVY,
  fontSize: 17,
  fontWeight: '700',
  marginBottom: 8,
},
errorSub: {
  color: '#6b7494',
  fontSize: 13,
  textAlign: 'center',
  marginBottom: 24,
},
retryButton: {
  backgroundColor: BLUE,
  borderRadius: 4,
  paddingVertical: 12,
  paddingHorizontal: 36,
},
retryText: {
  color: '#fff',
  fontSize: 15,
  fontWeight: '600',
  letterSpacing: 0.5,
},
});

export default DashboardWebViewScreen;