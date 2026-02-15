import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.css'
})
export class LoginComponent {
    loginData = {
        email: '',
        password: ''
    };

    isSubmitting = false;
    error: string | null = null;

    private supabaseService = inject(SupabaseService);
    private router = inject(Router);

    async onLogin() {
        this.isSubmitting = true;
        this.error = null;

        try {
            const result = await this.supabaseService.login(this.loginData.email, this.loginData.password);

            if (result.data) {
                const user = result.data;
                localStorage.setItem('user_name', user.full_name);
                localStorage.setItem('user_avatar', user.avatar_url || '');

                if (user.role === 'superadmin') {
                    localStorage.setItem('user_role', 'superadmin');
                    this.router.navigate(['/super-admin']);
                } else {
                    localStorage.setItem('user_role', user.role);
                    localStorage.setItem('active_merchant_id', user.merchant_id);
                    localStorage.setItem('merchant_name', user.merchants?.name || 'Comercio');
                    localStorage.setItem('merchant_slug', user.merchants?.slug || '');
                    this.router.navigate(['/metrics']);
                }
                return;
            }

            if (result.error) {
                console.error('Supabase error:', result.error);
                if (result.error.message.includes('JSON object requested, multiple (or no) rows returned')) {
                    this.error = 'Credenciales incorrectas. El usuario no existe o la contraseña es errónea.';
                } else {
                    this.error = `Error: ${result.error.message}`;
                }
            } else {
                this.error = 'Credenciales incorrectas. Verifica tu email y contraseña.';
            }
        } catch (err: any) {
            this.error = 'Error de conexión con la base de datos.';
            console.error(err);
        } finally {
            this.isSubmitting = false;
        }
    }
}
