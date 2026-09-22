
# Skool 360 — Login + Dashboard WebView

## Files
- `src/config/api.ts` — base URL, endpoint, login-URL builder
- `src/services/authTypes.ts` — API response / session types
- `src/services/authService.ts` — calls `LoginWithPasswordNew`, persists session in AsyncStorage
- `src/screens/LoginScreen.tsx` — UI matching the Skool 360 branding
- `src/screens/DashboardWebViewScreen.tsx` — WebView that auto-submits the real login form, then lands on `/Dashboard`
- `src/navigation/` — stack navigator + param types

## New dependencies (not yet in your project, per the plan you picked)
```
npm install @react-navigation/native @react-navigation/native-stack
npm install react-native-screens react-native-safe-area-context
npm install react-native-webview
npm install @react-native-async-storage/async-storage
```
Run `pod install` in `ios/` afterward.

`App.tsx` just needs to render `<RootNavigator />`.

## ⚠️ One thing you need to verify
I don't have the HTML of the real `edplex.skool360.com` login page, only the mobile API and the native-style screenshot. Two things in `DashboardWebViewScreen.tsx` are educated guesses and must be confirmed against the real page:

1. **`API_CONFIG.WEB_LOGIN_URL`** in `api.ts` — set to `/Login` as a placeholder. Confirm the actual path.
2. **Field selectors** in `buildLoginInjection()` — it tries `#UserID`, `#userid`, `input[name="UserID"]`, then falls back to generic `input[type="text"]` / `input[type="password"]`. If the real form uses different ids/names, replace the first two selector guesses with the real ones (view-source on the login page will show you).

If the selectors are wrong, the screen will show a red error banner at the bottom telling you injection failed, instead of failing silently.

## Flow
1. User enters UserID/Password on `LoginScreen`.
2. `authService.login()` hits `LoginWithPasswordNew`, validates `status === "1"`, stores `{user, username, password}` in AsyncStorage.
3. Navigates to `DashboardWebViewScreen`, which loads `WEB_LOGIN_URL`, injects JS to fill + submit the real form.
4. On successful web login the site's own redirect takes the WebView to `/Dashboard`; `onNavigationStateChange` detects that URL and stops re-injecting.