import { Stack, Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { Colors } from '../../src/constants/theme';

export default function AppLayout() {
  const { profile } = useAuthStore();

  if (!profile) {
    return <Redirect href="/(auth)/login" />;
  }

  const gradientHeaderBackground = () => (
    <LinearGradient
      colors={[Colors.headerTop, Colors.headerBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackground: gradientHeaderBackground,
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700', color: '#FFFFFF' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="chat/[id]"
        options={{
          headerShown: true,
          title: 'Conversación',
        }}
      />
      <Stack.Screen
        name="order/[id]"
        options={{
          headerShown: true,
          title: 'Detalle de Pedido',
        }}
      />
      <Stack.Screen
        name="customer/[id]"
        options={{
          headerShown: true,
          title: 'Ficha de Cliente (CRM)',
        }}
      />
    </Stack>
  );
}
