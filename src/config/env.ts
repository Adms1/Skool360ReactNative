import Config from 'react-native-config';


console.log(Config.BASE_URL);
export const ENV = {
  BASE_URL: Config.BASE_URL,
  TOKEN_ID: Config.TOKEN_ID,
  WEB_LOGIN_URL: Config.WEB_LOGIN_URL,
  DASHBOARD_URL: Config.DASHBOARD_URL,
};