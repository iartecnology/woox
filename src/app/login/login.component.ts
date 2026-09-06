import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../supabase.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
    loginData = {
        email: '',
        password: ''
    };

    isSubmitting = false;
    error: string | null = null;

    private supabaseService = inject(SupabaseService);
    private router = inject(Router);

    ngOnInit() {
        // Persistencia de Sesión Estilo WhatsApp:
        // Si el usuario ya está autenticado localmente, entrar directo sin pedir credenciales.
        const userRole = localStorage.getItem('user_role');
        if (userRole) {
            if (userRole === 'superadmin') {
                this.router.navigate(['/super-admin']);
            } else {
                this.router.navigate(['/metrics']);
            }
        }
    }

    async onLogin() {
        this.isSubmitting = true;
        this.error = null;

        try {
            const result = await this.supabaseService.login(this.loginData.email, this.loginData.password);

            if (result.data) {
                const user = result.data;
                localStorage.setItem('user_id', user.id);
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
                    localStorage.setItem('merchant_industry_type', user.merchants?.industry_type || 'retail');
                    this.router.navigate(['/metrics']);
                }
                return;
            }

            if (result.error) {
                console.error('Supabase error:', result.error);
                this.error = 'Credenciales incorrectas. Verifica tu email y contraseña.';
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
