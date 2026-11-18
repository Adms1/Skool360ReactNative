import Config from 'react-native-config';

export const ENV = {
  BASE_URL: Config.BASE_URL || 'https://edplex.skool360.com',
  TOKEN_ID: Config.TOKEN_ID || 't1506-o2506-u3506-r4edp',
  WEB_LOGIN_URL: Config.WEB_LOGIN_URL || 'https://edplex.skool360.com/Login',
  DASHBOARD_URL: Config.DASHBOARD_URL || 'https://edplex.skool360.com/Dashboard',
  SESSION_KEY: Config.SESSION_KEY || '@skool360_session',
};
