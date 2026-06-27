import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import crmWebEnv from '../config/crmWebEnv';

const LOADER_MAX_MS = 8000;

const LOGIN_PATH_HINTS = ['/login', '/auth/login'];
const HOME_PATH_HINTS = ['/', '/dashboard', '/home'];

const isLoginOrHomeUrl = (url) => {
  try {
    const { pathname } = new URL(url);
    const path = pathname.toLowerCase().replace(/\/$/, '') || '/';
    if (LOGIN_PATH_HINTS.some((p) => path === p || path.endsWith(p))) return true;
    if (HOME_PATH_HINTS.includes(path)) return true;
    return false;
  } catch {
    return false;
  }
};

const shouldOpenExternally = (url) => {
  const lower = url.toLowerCase();
  return (
    lower.startsWith('whatsapp:') ||
    lower.startsWith('https://wa.me/') ||
    lower.startsWith('http://wa.me/') ||
    lower.startsWith('tel:') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('sms:') ||
    lower.startsWith('geo:') ||
    lower.startsWith('intent://')
  );
};

export const CrmWebViewScreen = () => {
  const webRef = useRef(null);
  const hideLoaderTimer = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(crmWebEnv.crmWebUrl);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const hideLoader = useCallback(() => {
    setLoading(false);
    if (hideLoaderTimer.current) {
      clearTimeout(hideLoaderTimer.current);
      hideLoaderTimer.current = null;
    }
  }, []);

  const showLoader = useCallback(() => {
    setLoading(true);
    if (hideLoaderTimer.current) clearTimeout(hideLoaderTimer.current);
    hideLoaderTimer.current = setTimeout(hideLoader, LOADER_MAX_MS);
  }, [hideLoader]);

  useEffect(() => {
    showLoader();
    return () => {
      if (hideLoaderTimer.current) clearTimeout(hideLoaderTimer.current);
    };
  }, [showLoader]);

  const confirmExit = useCallback(() => {
    Alert.alert('Exit JSK CRM', 'Do you want to close the app?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
    ]);
  }, []);

  const handleAndroidBack = useCallback(() => {
    if (canGoBack && webRef.current) {
      webRef.current.goBack();
      return true;
    }
    if (isLoginOrHomeUrl(currentUrl)) {
      confirmExit();
      return true;
    }
    confirmExit();
    return true;
  }, [canGoBack, confirmExit, currentUrl]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleAndroidBack);
    return () => sub.remove();
  }, [handleAndroidBack]);

  const onNavigationStateChange = (navState) => {
    setCanGoBack(navState.canGoBack);
    setCurrentUrl(navState.url);
    if (navState.loading === false) {
      hideLoader();
    }
  };

  const onShouldStartLoadWithRequest = (request) => {
    const { url } = request;
    if (!url || url === 'about:blank') return true;
    if (shouldOpenExternally(url)) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Cannot open link', url);
      });
      return false;
    }
    return true;
  };

  return (
    <SafeAreaView style={styles.container}>
      {offline ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            No internet connection. Check network and try again.
          </Text>
        </View>
      ) : null}
      <WebView
        ref={webRef}
        source={{ uri: crmWebEnv.crmWebUrl }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onLoadProgress={({ nativeEvent }) => {
          if (nativeEvent.progress >= 0.85) hideLoader();
        }}
        onLoadEnd={hideLoader}
        onError={() => {
          hideLoader();
          setOffline(true);
        }}
        onHttpError={hideLoader}
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        userAgent={`JSKCRM-Android/${Platform.OS} ExpoWebView`}
      />
      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color="#1e3a8a" />
          <Text style={styles.loaderText}>Loading JSK CRM…</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  loaderText: {
    marginTop: 12,
    color: '#1e3a8a',
    fontWeight: '600',
  },
  offlineBanner: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#fcd34d',
  },
  offlineText: {
    color: '#92400e',
    fontSize: 13,
    textAlign: 'center',
  },
});

export default CrmWebViewScreen;
