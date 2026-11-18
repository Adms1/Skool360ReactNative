import AsyncStorage from '@react-native-async-storage/async-storage';
import {buildLoginUrl} from './api';
import {LoginApiResponse, StoredSession, UserData} from './Authtypes';
import {removeTokenFromServer} from './Notificationservice';
import {ENV} from '../config/env';

const SESSION_KEY: string = ENV.SESSION_KEY || '@skool360_session';

class AuthServiceClass {

async login(username: string, password: string): Promise<UserData> {
  const fail = (message: string, code: 'NETWORK' | 'SERVER') => {
    const e: any = new Error(message);
    e.code = code;
    return e;
  };

  const url = buildLoginUrl(username, password);

  let response: Response;
  try {
    response = await fetch(url, {method: 'POST'});
  } catch (err) {
    throw fail('No internet connection. Please check your network.', 'NETWORK');
  }

  if (!response.ok) {
    throw fail('Server error. Please try again later.', 'SERVER');
  }

  let json: LoginApiResponse;
  try {
    json = await response.json();
  } catch (err) {
    throw fail('Server error. Please try again later.', 'SERVER');
  }

  if (json.status !== '1' || !json.data || json.data.length === 0) {
    throw new Error(json.message || 'Invalid UserID or Password.');
  }

  const user = json.data[0];

  await this.saveSession({
    user,
    username,
    password,
    loggedInAt: Date.now(),
  });

  // Automatically register device push token for this user
  try {
    const {registerDeviceForPush} = require('./Notificationservice');
    registerDeviceForPush().catch((err: any) => {});
  } catch (e) {
  }

  return user;
}

  async saveSession(session: StoredSession): Promise<void> {
    try {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('Failed to save session:', e);
    }
  }

  async getSession(): Promise<StoredSession | null> {
    try {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredSession;
    } catch (e) {
      console.warn('Failed to get session:', e);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await removeTokenFromServer();
    } catch (e) {}
    try {
      await AsyncStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.warn('Failed to remove session:', e);
    }
  }
}

export const AuthService = new AuthServiceClass();
