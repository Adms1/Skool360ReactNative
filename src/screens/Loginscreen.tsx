import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
  Keyboard,
  Animated,
  useWindowDimensions,
} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../services/Types';
import {AuthService} from '../services/Authservice';
import DashboardSkeleton from './DashboardSkeleton';

type LoginScreenNavProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavProp;
}

// Material "visibility" / "visibility_off" icons (blue, like the reference)
const EYE_OPEN =
  'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';
const EYE_OFF =
  'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z';

const LoginScreen: React.FC<Props> = ({navigation}) => {
  // Card proportions measured from the reference screenshot:
  // card = 88% of the screen width (about 6% margin each side), side padding = 8.3% of the card
  const {width: screenWidth} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardWidth = Math.min(screenWidth * 0.883, 460);
  const cardPadding = cardWidth * 0.083;

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    SystemNavigationBar.setNavigationColor('#d5e1f9', 'dark', 'navigation');
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(message);
    Animated.timing(toastOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, 3000);
  };

  const handleLogin = async () => {
    if (!userId.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Please enter both UserID and Password.');
      return;
    }

    setLoading(true);
    try {
      await AuthService.login(userId.trim(), password);

      Keyboard.dismiss();
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'DashboardWebView',
            params: {username: userId.trim(), password},
          },
        ],
      });
    } catch (err: any) {
      if (err?.code === 'NETWORK' || err?.code === 'SERVER') {
        showToast(err.message);
      } else {
        showToast('Incorrect credentials..');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.flex}>
      {/* a plain View (not a ScrollView): the form stays exactly where it is when the keyboard opens */}
      <View style={styles.scrollContent}>
        <View
          style={[
            styles.card,
            {
              width: cardWidth,
              paddingHorizontal: cardPadding,
              paddingTop: cardWidth * 0.105,
              paddingBottom: cardPadding,
            },
          ]}>
          <Image
            source={require('../assets/images/skool360-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text allowFontScaling={false} style={styles.label}>
            UserID
          </Text>
          <TextInput
            allowFontScaling={false}
            style={styles.input}
            value={userId}
            onChangeText={setUserId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter UserID"
            placeholderTextColor="#c4c7cc"
          />

          <Text allowFontScaling={false} style={styles.label}>
            Password
          </Text>
          <View style={styles.passwordRow}>
            <TextInput
              allowFontScaling={false}
              style={styles.passwordInput}
              value={password}
              onChangeText={text => setPassword(text.replace(/\s/g, ''))} // spaces are not allowed in the password
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter Password"
              placeholderTextColor="#c4c7cc"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(prev => !prev)}
              style={styles.eyeButton}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path d={showPassword ? EYE_OPEN : EYE_OFF} fill={BLUE} />
              </Svg>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text allowFontScaling={false} style={styles.loginButtonText}>
                Log in
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* our own strip behind the Android navigation bar (same colour as the dashboard) */}
      <View style={{height: insets.bottom, backgroundColor: '#d5e1f9'}} />

      {/* while signing in: dashboard-shaped placeholder instead of a blank wait */}
      {loading && <DashboardSkeleton topInset={insets.top} blockTouches />}

      <Animated.View
        pointerEvents="none"
        style={[styles.toast, {opacity: toastOpacity}]}>
        <Text allowFontScaling={false} style={styles.toastText}>
          {toastMsg}
        </Text>
      </Animated.View>
    </View>
  );
};

const BLUE = '#3b82f6';
const BORDER = '#d0d3d9';

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: BLUE,
  },
  scrollContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  logo: {
    width: '72%',
    aspectRatio: 4.2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    color: '#111111',
    marginBottom: 4,
  },
  input: {
    height: 38,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#1c1c1c',
    marginBottom: 14,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    marginBottom: 26,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#1c1c1c',
  },
  eyeButton: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButton: {
    height: 42,
    backgroundColor: BLUE,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  toast: {
    position: 'absolute',
    bottom: 40,
    left: 30,
    right: 30,
    backgroundColor: '#d32f2f',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    elevation: 6,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default LoginScreen;