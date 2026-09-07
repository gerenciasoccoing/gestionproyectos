import { useEffect } from 'react';
import { Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { flushQueue, subscribeAutoSync } from './src/offline/queue';

function onSyncResult(result) {
  if (result?.succeeded > 0) {
    Alert.alert('Sincronización', `Se enviaron ${result.succeeded} registro(s) pendiente(s) guardados sin conexión.`);
  }
}

export default function App() {
  // Intenta sincronizar lo que haya quedado pendiente de una sesión anterior apenas abre la app,
  // y de ahí en adelante cada vez que vuelve la conexión (ver offline/queue.js#subscribeAutoSync).
  useEffect(() => {
    flushQueue().then(onSyncResult).catch(() => {});
    const unsubscribe = subscribeAutoSync(onSyncResult);
    return unsubscribe;
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </AuthProvider>
  );
}
