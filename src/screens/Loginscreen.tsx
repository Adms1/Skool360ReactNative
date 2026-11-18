import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
  Keyboard,
  Animated,
} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../services/Types';
import {AuthService} from '../services/Authservice';

type LoginScreenNavProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavProp;
}

const LoginScreen: React.FC<Props> = ({navigation}) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
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
            placeholderTextColor="#b5b9c2"
          />

          <Text allowFontScaling={false} style={styles.label}>
            Password
          </Text>
          <View style={styles.passwordRow}>
            <TextInput
              allowFontScaling={false}
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter Password"
              placeholderTextColor="#b5b9c2"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(prev => !prev)}
              style={styles.eyeButton}>
              <Text allowFontScaling={false} style={styles.eyeText}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
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
      </ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[styles.toast, {opacity: toastOpacity}]}>
        <Text allowFontScaling={false} style={styles.toastText}>
          {toastMsg}
        </Text>
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

const BLUE = '#3b82f6';
const NAVY = '#1e3a8a';
const BORDER = '#cfd4dc';

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: BLUE,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 4,
    paddingHorizontal: 30,
    paddingTop: 30,
    paddingBottom: 28,
  },
  logo: {
     width:  220,
     height: 70,
      alignSelf: 'center',
     marginBottom: 32,
   },
  orgName: {
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 24,
    fontSize: 22,
    color: '#1b5e3b',
    fontFamily: Platform.select({ios: 'Georgia', android: 'serif'}),
  },
  label: {
    fontSize: 16,
    color: '#111',
    marginBottom: 6,
  },
  input: {
    height: 46,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#1c1c1c',
    marginBottom: 14,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    marginBottom: 18,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#1c1c1c',
  },
  eyeButton: {
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeText: {
    color: NAVY,
    fontSize: 12,
    fontWeight: '600',
  },
  loginButton: {
    height: 46,
    backgroundColor: BLUE,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  poweredBy: {
    alignSelf: 'center',
    marginTop: 22,
    fontSize: 12,
    color: '#8a8f98',
  },
  bottomLogo: {
    width: 140,
    height: 40,
    alignSelf: 'center',
    marginTop: 4,
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