import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '../../src/stores/useAuthStore';

export default function AppLayout() {
  const { profile } = useAuthStore();

  if (!profile) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="chat/[id]"
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0F172A',
          title: 'Conversación',
        }}
      />
      <Stack.Screen
        name="order/[id]"
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0F172A',
          title: 'Detalle de Pedido',
        }}
      />
      <Stack.Screen
        name="customer/[id]"
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0F172A',
          title: 'Ficha de Cliente (CRM)',
        }}
      />
    </Stack>
  );
}
