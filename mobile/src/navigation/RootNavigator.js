import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import LoginScreen from '../screens/LoginScreen';
import ProjectsListScreen from '../screens/ProjectsListScreen';
import ProjectDetailScreen from '../screens/ProjectDetailScreen';
import RegisterProgressScreen from '../screens/RegisterProgressScreen';
import RegisterExpenseScreen from '../screens/RegisterExpenseScreen';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '600' },
};

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={screenOptions}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Projects" component={ProjectsListScreen} options={{ title: 'Mis proyectos' }} />
            <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} options={({ route }) => ({ title: route.params?.projectName || 'Proyecto' })} />
            <Stack.Screen name="RegisterProgress" component={RegisterProgressScreen} options={{ title: 'Registrar avance' }} />
            <Stack.Screen name="RegisterExpense" component={RegisterExpenseScreen} options={{ title: 'Registrar gasto' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
