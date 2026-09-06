import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../supabase.service';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './register.component.html',
    styleUrl: './register.component.css'
})
export class RegisterComponent {
    private supabaseService = inject(SupabaseService);
    private router = inject(Router);

    currentStep: number = 1;
    isSubmitting = false;
    error: string | null = null;
    successMessage: string | null = null;

    formData = {
        businessName: '',
        industryType: 'restaurant',
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        acceptTerms: false
    };

    industries = [
        { id: 'restaurant', name: 'Restaurante / Comidas', icon: '🍔' },
        { id: 'retail', name: 'Comercio / Tienda', icon: '🛍️' },
        { id: 'services', name: 'Servicios Profesionales', icon: '💼' },
        { id: 'health_beauty', name: 'Salud / Belleza / Spa', icon: '💆' },
        { id: 'other', name: 'Otro Negocio', icon: '✨' }
    ];

    nextStep() {
        this.error = null;
        if (this.currentStep === 1) {
            if (!this.formData.businessName.trim()) {
                this.error = 'Por favor ingresa el nombre de tu negocio o empresa.';
                return;
            }
            this.currentStep = 2;
        } else if (this.currentStep === 2) {
            if (!this.formData.fullName.trim() || !this.formData.email.trim()) {
                this.error = 'Por favor completa tu nombre y correo electrónico.';
                return;
            }
            if (!this.formData.password || this.formData.password.length < 6) {
                this.error = 'La contraseña debe tener al menos 6 caracteres.';
                return;
            }
            if (this.formData.password !== this.formData.confirmPassword) {
                this.error = 'Las contraseñas no coinciden.';
                return;
            }
            this.currentStep = 3;
        }
    }

    prevStep() {
        this.error = null;
        if (this.currentStep > 1) {
            this.currentStep--;
        }
    }

    async onRegister() {
        this.isSubmitting = true;
        this.error = null;

        try {
            const res = await this.supabaseService.registerMerchant({
                businessName: this.formData.businessName,
                fullName: this.formData.fullName,
                email: this.formData.email.trim().toLowerCase(),
                password: this.formData.password,
                industryType: this.formData.industryType
            });

            if (res.error) {
                this.error = res.error.message || 'No se pudo completar el registro.';
                return;
            }

            const { profile, merchant } = res.data;

            // Iniciar sesión automáticamente
            localStorage.setItem('user_id', profile.id);
            localStorage.setItem('user_name', profile.full_name);
            localStorage.setItem('user_role', profile.role);
            localStorage.setItem('active_merchant_id', merchant.id);
            localStorage.setItem('merchant_name', merchant.name);
            localStorage.setItem('merchant_slug', merchant.slug);
            localStorage.setItem('merchant_industry_type', merchant.industry_type);
            localStorage.setItem('is_new_onboarding', 'true');

            this.successMessage = '¡Cuenta creada con éxito! Redirigiendo a tu espacio de trabajo...';
            setTimeout(() => {
                this.router.navigate(['/metrics']);
            }, 1200);

        } catch (err: any) {
            this.error = err.message || 'Error de comunicación con el servidor.';
        } finally {
            this.isSubmitting = false;
        }
    }
}
