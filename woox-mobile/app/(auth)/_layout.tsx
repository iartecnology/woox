import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#2F2E94' } }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
