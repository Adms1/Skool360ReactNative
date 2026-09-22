import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  BackHandler,
  ScrollView,
  TouchableOpacity,
  Modal,
  Linking,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import {WebView as RNWebView, WebViewNavigation} from 'react-native-webview';
import {SafeAreaView} from 'react-native-safe-area-context';
import RNPrint from 'react-native-print';
import RNFetchBlob from 'react-native-blob-util';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../services/Types';
import {API_CONFIG} from '../services/api';
import {registerDeviceForPush} from '../services/Notificationservice';
import {AuthService} from '../services/Authservice';
import {ToastAndroid} from 'react-native';

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

// If we haven't reached /Dashboard within this long, reveal the WebView
// instead of leaving the user stuck behind a spinner.
const AUTH_TIMEOUT_MS = 15000;

const PULL_TRIGGER_DISTANCE = 70; // drag past this to trigger a refresh
const PULL_MAX_DISTANCE = 100;    // resistance cap while dragging
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
  IOS_FAST_TAP_INJECTION
} from './DashboardInjections';
const DashboardWebViewScreen: React.FC<Props> = ({route, navigation}) => {
  const {username, password} = route.params;
  const webViewRef = useRef<any>(null);
  const canGoBackRef = useRef(false);
  const reachedDashboardRef = useRef(false);
  const attemptedAutoLoginRef = useRef(false);
  const loggedOutRef = useRef(false);
  const [authenticating, setAuthenticating] = useState(true);
  const [userOptions, setUserOptions] = useState<UserProfileOption[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
  const logoPulse = useRef(new Animated.Value(1)).current;
  const splashFade = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
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

  const downloadFile = async (url: string) => {
    if (!url) return;

    const granted = await requestStoragePermissionIfNeeded();
    if (!granted) {
      Alert.alert('Permission required', 'Storage permission is needed to save the file.');
      return;
    }

    const fileName = getFileNameFromUrl(url);
    const mimeType = guessMimeType(fileName);

    if (Platform.OS === 'android') {
      try {
        const RNFetchBlob = require('react-native-blob-util').default;
        const {config} = RNFetchBlob;

        await config({
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            title: fileName,
            description: 'Downloading file',
            mime: mimeType,
            mediaScannable: true,
            path: `${RNFetchBlob.fs.dirs.DownloadDir}/${fileName}`,
          },
        }).fetch('GET', url);

        ToastAndroid.show('File downloaded successfully', ToastAndroid.LONG);
      } catch (error) {
        ToastAndroid.show('Download failed', ToastAndroid.LONG);
      }
      return;
    }

    try {
      const RNFetchBlob = require('react-native-blob-util').default;
      const {fs} = RNFetchBlob;

      setDownloadState({visible: true, progress: 0, fileName, error: false});

      const res = await RNFetchBlob.fetch('GET', url);
      if (res.info().status !== 200) {
        throw new Error(`HTTP ${res.info().status}`);
      }

      const base64 = res.base64();
      setDownloadState(prev => ({...prev, progress: 0.7}));

      const tempPath = `${fs.dirs.CacheDir}/${fileName}`;
      await fs.writeFile(tempPath, base64, 'base64');
      setDownloadState(prev => ({...prev, progress: 0.9}));

      await fs.cp(tempPath, `${fs.dirs.DocumentDir}/${fileName}`);

      setDownloadState(prev => ({...prev, progress: 1}));
      setTimeout(() => {
        setDownloadState({visible: false, progress: 0, fileName: '', error: false});
      }, 1000);
    } catch (error) {
      setDownloadState(prev => ({...prev, error: true}));
      setTimeout(() => {
        setDownloadState({visible: false, progress: 0, fileName: '', error: false});
      }, 2000);
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
      if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (videoUrl) {
        setVideoUrl(null);
        return true;
      }
      if (canGoBackRef.current && !currentUrlRef.current.includes('/Dashboard')) {
            webViewRef.current?.goBack();
            return true;
          }
          return false;
    });
    return () => subscription.remove();
  }, [videoUrl]);
 useEffect(() => {
   if (!showSplash) return;

   splashFade.setValue(0);

   Animated.timing(splashFade, {
     toValue: 1,
     duration: 250,
     useNativeDriver: true,
   }).start();

   const pulseLoop = Animated.loop(
     Animated.sequence([
       Animated.timing(logoPulse, {
         toValue: 1.08,
         duration: 900,
         useNativeDriver: true,
       }),
       Animated.timing(logoPulse, {
         toValue: 1,
         duration: 900,
         useNativeDriver: true,
       }),
     ]),
   );

   pulseLoop.start();

   const createDotAnimation = (
     value: Animated.Value,
     delay: number,
   ) =>
     Animated.loop(
       Animated.sequence([
         Animated.timing(value, {
           toValue: 1,
           duration: 350,
           delay,
           useNativeDriver: true,
         }),
         Animated.timing(value, {
           toValue: 0,
           duration: 350,
           useNativeDriver: true,
         }),
       ]),
     );

   const d1 = createDotAnimation(dot1, 0);
   const d2 = createDotAnimation(dot2, 150);
   const d3 = createDotAnimation(dot3, 300);

   d1.start();
   d2.start();
   d3.start();

   return () => {
     pulseLoop.stop();
     d1.stop();
     d2.stop();
     d3.stop();
   };
 }, [showSplash]);
  const handleNavStateChange = (navState: WebViewNavigation) => {
     canGoBackRef.current = navState.canGoBack;
      currentUrlRef.current = navState.url;
      setIsOnDashboard(navState.url.includes('/Dashboard'));
    if (navState.url.includes('/Dashboard') && !navState.loading) {
      if (!reachedDashboardRef.current) {
        reachedDashboardRef.current = true;
        registerDeviceForPush();
      }
      setAuthenticating(false);
      setUserOptions(null);
      return;
    }

    if (
      reachedDashboardRef.current &&
      !loggedOutRef.current &&
      navState.url.toLowerCase().includes('login')
    ) {
        setAuthenticating(true)
      loggedOutRef.current = true;
      navigation.reset({index: 0, routes: [{name: 'Login'}]});
      AuthService.logout().catch(() => {});
    }
  };

  const handleLoadEnd = (event: any) => {
    if (refreshing) {
      setRefreshing(false);
      springTo(0);
    }
    webViewRef.current?.injectJavaScript(PULL_REFRESH_INJECTION);
    webViewRef.current?.injectJavaScript(PRINT_OVERRIDE_INJECTION);
    webViewRef.current?.injectJavaScript(UPI_INTERCEPT_INJECTION);
    webViewRef.current?.injectJavaScript(MODAL_CONTROL);
    webViewRef.current?.injectJavaScript(DISABLE_ZOOM_INJECTION);
    webViewRef.current?.injectJavaScript(IOS_FAST_TAP_INJECTION);
    const loadedUrl: string = event?.nativeEvent?.url ?? '';
    const onDashboard = reachedDashboardRef.current || loadedUrl.includes('/Dashboard');
    if (onDashboard) {
      if (!reachedDashboardRef.current) {
        reachedDashboardRef.current = true;
        registerDeviceForPush();
      }
      setAuthenticating(false);
      return;
    }

    if (!attemptedAutoLoginRef.current) {
      attemptedAutoLoginRef.current = true;
      webViewRef.current?.injectJavaScript(buildLoginInjection(username, password));
    }
  };
  const handleMessage = (event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);

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

  const handleSelectProfile = (index: number) => {
    setUserOptions(null);
    setAuthenticating(true);
    webViewRef.current?.injectJavaScript(buildSelectUserInjection(index));
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
    if (
        reachedDashboardRef.current &&
        request.navigationType === 'backforward' &&
        !url.includes('/Dashboard')
      ) {
        return false;
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

    if (looksLikeVideo(url)) {
      setVideoUrl(url);
      return false;
    }

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
      if (looksLikeVideo(targetUrl)) {
        setVideoUrl(targetUrl);
        return;
      }
      if (looksLikeDownload(targetUrl)) {
        downloadFile(targetUrl);
        return;
      }
      webViewRef.current?.injectJavaScript(
        `window.location.href = ${JSON.stringify(targetUrl)}; true;`,
      );
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <WebView
        ref={webViewRef}
        source={{uri: API_CONFIG.DASHBOARD_URL}}
        allowsBackForwardNavigationGestures={!isOnDashboard}
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
          const failingUrl = syntheticEvent?.nativeEvent?.url || '';
          if (
            failingUrl.startsWith('upi://') ||
            failingUrl.startsWith('intent://') ||
            failingUrl.startsWith('gpay://') ||
            failingUrl.startsWith('phonepe://') ||
            failingUrl.startsWith('paytmmp://')
          ) {
            openUpiPayment(failingUrl);
          }
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
        {showSplash && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.splashOverlay,
              {opacity: splashFade},
            ]}>
            <Animated.Image
              source={require('../assets/images/skool360-logo.png')}
              resizeMode="contain"
              style={[
                styles.splashLogo,
                {
                  transform: [{scale: logoPulse}],
                },
              ]}
            />
            <Text style={styles.splashTitle}>
              Getting things ready
            </Text>

            <View style={styles.dotsRow}>
              {[dot1, dot2, dot3].map((dot, index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.dot,
                    {
                      opacity: dot.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 1],
                      }),
                      transform: [
                        {
                          translateY: dot.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -6],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ))}
            </View>
          </Animated.View>
        )}
      {!hideWebView && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pullIndicator,
            {
              transform: [
                {
                  translateY: pullAnim.interpolate({
                    inputRange: [0, PULL_MAX_DISTANCE],
                    outputRange: [-40, 20],
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
          <ActivityIndicator size="small" color={NAVY} />
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
                  <Text style={styles.selectAvatarText}>{'\u{1F464}'}</Text>
                </View>
                <View style={styles.selectCardBody}>
                  <Text style={styles.selectName}>{option.name}</Text>
                  {!!option.userType && <Text style={styles.selectMeta}>{option.userType}</Text>}
                  {!!option.schoolName && (
                    <Text style={styles.selectMeta}>{option.schoolName}</Text>
                  )}
                </View>
                <Text style={styles.selectChevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={downloadState.visible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={styles.downloadCard}>
            <Text style={styles.downloadFileName} numberOfLines={1}>
              {downloadState.fileName}
            </Text>
            {downloadState.error ? (
              <Text style={styles.downloadErrorText}>Download failed</Text>
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
                <Text style={styles.progressLabel}>
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
            <Text style={styles.videoCloseText}>{'\u2715'}  Close</Text>
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

      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const NAVY = '#173a9c';

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: NAVY,
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
    color: NAVY,
    fontSize: 14,
    fontWeight: '600',
  },
  selectOverlay: {
    flex: 1,
    backgroundColor: NAVY,
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
    paddingTop: 12,
    zIndex: 10,
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
});

export default DashboardWebViewScreen;