import React, {useEffect, useRef} from 'react';
import {View, Text, StyleSheet, Animated, Platform,Image} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../services/Types';
import {AuthService} from '../services/Authservice';

type AuthGateNavProp = NativeStackNavigationProp<RootStackParamList, 'AuthGate'>;

interface Props {
  navigation: AuthGateNavProp;
}

const AuthGateScreen: React.FC<Props> = ({navigation}) => {
  const navigatedRef = useRef(false);
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createDotAnimation = (value: Animated.Value, delay: number) =>
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
      d1.stop();
      d2.stop();
      d3.stop();
    };
  }, [dot1, dot2, dot3]);

  useEffect(() => {
    let isMounted = true;

    const navigateTo = (routeName: 'DashboardWebView' | 'Login', params?: any) => {
      if (navigatedRef.current || !isMounted) return;
      navigatedRef.current = true;
      if (routeName === 'DashboardWebView') {
        navigation.reset({
          index: 0,
          routes: [{name: 'DashboardWebView', params}],
        });
      } else {
        navigation.reset({index: 0, routes: [{name: 'Login'}]});
      }
    };

    // Safety timeout: If session check hangs or takes longer than 3s, force move to Login
    const timer = setTimeout(() => {
      navigateTo('Login');
    }, 3000);

    (async () => {
      try {
        const session = await AuthService.getSession();
        if (session && session.username && session.password) {
          clearTimeout(timer);
          navigateTo('DashboardWebView', {
            username: session.username,
            password: session.password,
          });
          return;
        }
      } catch (err) {
        console.warn('AuthGate session check error:', err);
      }
      clearTimeout(timer);
      navigateTo('Login');
    })();

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [navigation]);

  return (
    <View style={styles.container}>
     <Image
                source={require('../assets/images/skool360-logo.png')}
                style={styles.orgName}
                resizeMode="contain"
              />

      <Text allowFontScaling={false} style={styles.title}>Getting things ready</Text>

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
    </View>
  );
};

const NAVY = '#173a9c';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  orgName: {
    marginBottom: 24,
    fontSize: 22,
    color: '#1b5e3b',
    fontFamily: Platform.select({ios: 'Georgia', android: 'serif'}),
  },
  title: {
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

export default AuthGateScreen;