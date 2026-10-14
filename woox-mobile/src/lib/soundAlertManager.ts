import * as Haptics from 'expo-haptics';

class SoundAlertManager {
  private isAlarmPlaying = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  async startOrderAlert() {
    if (this.isAlarmPlaying) return;
    this.isAlarmPlaying = true;

    // Disparar vibración inicial
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    // Bucle háptico de emergencia cada 2 segundos hasta que sea atendido
    this.intervalId = setInterval(() => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch {}
    }, 2000);
  }

  stopOrderAlert() {
    this.isAlarmPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isPlaying() {
    return this.isAlarmPlaying;
  }
}

export const soundAlertManager = new SoundAlertManager();
