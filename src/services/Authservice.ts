import AsyncStorage from '@react-native-async-storage/async-storage';
import {buildLoginUrl} from './api';
import {LoginApiResponse, StoredSession, UserData} from './Authtypes';
import {removeTokenFromServer} from './Notificationservice';

const SESSION_KEY = '@skool360_session';

class AuthServiceClass {

  async login(username: string, password: string): Promise<UserData> {
    const url = buildLoginUrl(username, password);

    let response: Response;
    try {
      response = await fetch(url, {method: 'POST'});
    } catch (err) {
      throw new Error('Unable to reach the server. Check your connection.');
    }

    if (!response.ok) {
      throw new Error(`Login failed (HTTP ${response.status}).`);
    }

    let json: LoginApiResponse;
    try {
      json = await response.json();
    } catch (err) {
      throw new Error('Unexpected response from server.');
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
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  async getSession(): Promise<StoredSession | null> {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
      await removeTokenFromServer();
      await AsyncStorage.removeItem(SESSION_KEY);
    }
}

export const AuthService = new AuthServiceClass();
