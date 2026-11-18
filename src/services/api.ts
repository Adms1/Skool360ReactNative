import {ENV} from '../config/env';



export const API_CONFIG = {
  BASE_URL: ENV.BASE_URL,
  TOKEN_ID: ENV.TOKEN_ID,

  ENDPOINTS: {
    LOGIN: '/api/mobile/LoginWithPassword',
    DEVICE_TOKEN_ANDROID: '/api/mobile/DeviceToken_Insert_New',
    DEVICE_TOKEN_IOS: '/api/mobile/DeviceToken_Insert_Ios_New',
    DEVICE_TOKEN_REMOVE: '/api/mobile/DeviceToken_Remove',
  },

  WEB_LOGIN_URL: ENV.WEB_LOGIN_URL,
  DASHBOARD_URL: ENV.DASHBOARD_URL,
};

export const buildLoginUrl = (
  username: string,
  password: string,
  location: number = 0,
): string => {
  const params = new URLSearchParams({
    TokenId: API_CONFIG.TOKEN_ID || '',
    username,
    password,
    location: String(location),
  });

  return `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LOGIN}?${params.toString()}`;
};

export const buildDeviceTokenUrl = (
  platform: 'android' | 'ios',
  deviceTokenId: string,
  userId: string,
): string => {
  const endpoint =
    platform === 'ios'
      ? API_CONFIG.ENDPOINTS.DEVICE_TOKEN_IOS
      : API_CONFIG.ENDPOINTS.DEVICE_TOKEN_ANDROID;

  const params = new URLSearchParams({
    TokenId: API_CONFIG.TOKEN_ID || '',
    DeviceTokenId: deviceTokenId,
    UserId: userId,
    version: '0',
  });

  return `${API_CONFIG.BASE_URL}${endpoint}?${params.toString()}`;
};

export const buildDeviceTokenRemoveUrl = (
  deviceTokenId: string,
  userId: string,
): string => {
  const params = new URLSearchParams({
    TokenId: API_CONFIG.TOKEN_ID || '',
    DeviceTokenId: deviceTokenId,
    UserId: userId,
  });
  return `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DEVICE_TOKEN_REMOVE}?${params.toString()}`;
};