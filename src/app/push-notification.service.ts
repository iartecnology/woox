import { Injectable, inject } from '@angular/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase-config';

@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  // Ya no necesitamos inyectar SupabaseService para el cliente si lo importamos directamente

  async init(profileId: string) {
    if (Capacitor.getPlatform() !== 'web') {
      await this.registerNotifications(profileId);
    }
  }

  private async registerNotifications(profileId: string) {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      throw new Error('User denied permissions!');
    }

    await PushNotifications.register();

    // Listeners
    PushNotifications.addListener('registration', async (token) => {
      console.log('Push registration success, token: ' + token.value);
      await this.saveTokenToSupabase(profileId, token.value);
    });

    PushNotifications.addListener('registrationError', (error: any) => {
      console.error('Error on registration: ' + JSON.stringify(error));
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received: ' + JSON.stringify(notification));
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push action performed: ' + JSON.stringify(notification));
    });
  }

  private async saveTokenToSupabase(profileId: string, token: string) {
    const platform = Capacitor.getPlatform();
    
    const { error } = await supabase
      .from('fcm_tokens')
      .upsert({
        profile_id: profileId,
        token: token,
        platform: platform,
        updated_at: new Date().toISOString()
      }, { onConflict: 'profile_id,token' });

    if (error) {
      console.error('Error saving push token to Supabase:', error);
    } else {
      console.log('Push token saved successfully to Supabase');
    }
  }
}
