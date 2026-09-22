import React, {useEffect} from 'react';
import {View, StyleSheet, ActivityIndicator} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../services/Types';
import {AuthService} from '../services/Authservice';

type AuthGateNavProp = NativeStackNavigationProp<RootStackParamList, 'AuthGate'>;

interface Props {
  navigation: AuthGateNavProp;
}

const AuthGateScreen: React.FC<Props> = ({navigation}) => {
  useEffect(() => {
    (async () => {
      const session = await AuthService.getSession();

      if (session) {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'DashboardWebView',
              params: {username: session.username, password: session.password},
            },
          ],
        });
      } else {
        navigation.reset({index: 0, routes: [{name: 'Login'}]});
      }
    })();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#173a9c" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#173a9c',
  },
});

export default AuthGateScreen;