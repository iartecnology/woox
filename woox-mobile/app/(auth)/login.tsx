import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { signIn } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Campos requeridos', 'Por favor ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn(email.trim(), password.trim());

      if (!result.success) {
        Alert.alert('Error de inicio de sesión', result.error || 'Credenciales no válidas.');
        return;
      }

      router.replace('/(app)/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={[Colors.headerTop, Colors.headerBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.innerKeyboardContainer}
      >
        <View style={styles.cardContainer}>
          {/* Tarjeta de Cristal Translúcido (Frosted Glass) */}
          <View style={styles.card}>
            {/* Header con el Logo Oficial */}
            <View style={styles.header}>
              <Image
                source={require('../../assets/woox-logo-white.png')}
                style={styles.brandLogo}
                resizeMode="contain"
              />
              <Text style={styles.subtitle}>El futuro de tus ventas con Inteligencia Artificial</Text>
            </View>

            {/* Formulario */}
            <View style={styles.form}>
              <Text style={styles.label}>Correo Electrónico</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={19} color="rgba(255, 255, 255, 0.75)" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="admin@tuempresa.com"
                  placeholderTextColor="rgba(255, 255, 255, 0.55)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <Text style={styles.label}>Contraseña</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={19} color="rgba(255, 255, 255, 0.75)" style={styles.inputIcon} />
                <TextInput
                  style={styles.passwordInput}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255, 255, 255, 0.55)"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color="rgba(255, 255, 255, 0.8)"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.loginButton, loading && styles.disabledButton]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.88}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.headerPrimary} />
                ) : (
                  <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  innerKeyboardContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  cardContainer: {
    borderRadius: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 10,
  },
  card: {
    borderRadius: 26,
    padding: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  brandLogo: {
    width: '100%',
    maxWidth: 220,
    height: 60,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
  form: {
    gap: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    paddingVertical: 14,
    fontSize: 15,
  },
  passwordInput: {
    flex: 1,
    color: '#FFFFFF',
    paddingVertical: 14,
    fontSize: 15,
  },
  eyeButton: {
    paddingHorizontal: 6,
  },
  loginButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: Colors.headerPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
});
