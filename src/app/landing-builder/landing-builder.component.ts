import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
    selector: 'app-landing-builder',
    standalone: true,
    imports: [CommonModule, FormsModule, HttpClientModule],
    templateUrl: './landing-builder.component.html',
    styleUrl: './landing-builder.component.css'
})
export class LandingBuilderComponent implements OnInit {
    // Estado del Wizard
    currentStep: number = 1;
    isGenerating: boolean = false;
    isPublishing: boolean = false;

    // Datos del Negocio
    merchantId: string = '';
    businessInfo: string = '';
    logoUrl: string = '';

    // Resultado de la IA (Blueprint)
    blueprint: any = null;
    slug: string = '';

    // Configuración de la plataforma
    private supabaseService = inject(SupabaseService);
    private notificationService = inject(NotificationService);
    private http = inject(HttpClient);
    private cdr = inject(ChangeDetectorRef);

    constructor() { }

    async ngOnInit() {
        this.merchantId = localStorage.getItem('active_merchant_id') || localStorage.getItem('merchant_id') || '';
        if (!this.merchantId) {
            this.notificationService.show('❌ No se encontró un Merchant activo.', 'error');
        }

        // Cargar si ya tiene una landing guardada
        await this.loadExistingLanding();
    }

    async loadExistingLanding() {
        if (!this.merchantId) return;
        const { data, error } = await this.supabaseService.getLandingByMerchant(this.merchantId);
        if (data) {
            this.blueprint = {
                industry_type: data.industry_type,
                brand_name: data.seo_metadata?.title || '',
                content: data.content_blocks,
                theme_suggestion: {
                    palette: data.theme_palette,
                    typography: data.typography
                },
                blocks_order: data.blocks_order
            };
            this.slug = data.slug;
            this.currentStep = 3; // Mostrar resumen si ya existe
        }
    }

    async generateWithAI() {
        if (!this.businessInfo || this.businessInfo.length < 20) {
            this.notificationService.show('⚠️ Por favor describe tu negocio con un poco más de detalle.', 'warning');
            return;
        }

        this.isGenerating = true;
        this.currentStep = 2;

        const payload = {
            merchant_id: this.merchantId,
            business_info: this.businessInfo,
            logo_url: this.logoUrl
        };

        // Migración a Supabase Edge Functions
        const AI_ENGINE_URL = `${environment.supabaseUrl}/functions/v1/generate-landing`;

        this.http.post(AI_ENGINE_URL, payload, {
            headers: { 
                'Authorization': `Bearer ${environment.supabaseAnonKey}`,
                'Content-Type': 'application/json'
            }
        }).subscribe({
            next: (res: any) => {
                // El nuevo bot engine devuelve el blueprint directo o un objeto con error
                if (res && !res.error) {
                    this.blueprint = res;
                    this.slug = (this.blueprint.brand_name || 'mi-tienda').toLowerCase().replace(/[^a-z0-9]/g, '-');
                    this.notificationService.show('✨ ¡Landing Page generada con éxito!', 'success');
                    this.currentStep = 3;
                } else {
                    this.notificationService.show('❌ Error de la IA: ' + (res?.error || 'Respuesta inválida'), 'error');
                    this.currentStep = 1;
                }
                this.isGenerating = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Landing Gen Error:', err);
                let msg = '❌ No se pudo conectar con el servicio de generación.';
                if (err.status === 401) msg = '❌ Error de Autenticación (Permisos denegados).';
                if (err.status === 404) msg = '❌ El servicio "generate-landing" no está desplegado en Supabase.';
                
                this.notificationService.show(msg, 'error');
                this.isGenerating = false;
                this.currentStep = 1;
                this.cdr.detectChanges();
            }
        });
    }

    async publishLanding() {
        if (!this.blueprint) return;
        this.isPublishing = true;

        try {
            const landingData = {
                merchant_id: this.merchantId,
                slug: this.slug,
                industry_type: this.blueprint.industry_type,
                template_id: 'standard-v1',
                theme_palette: this.blueprint.theme_suggestion.palette,
                typography: this.blueprint.theme_suggestion.typography,
                blocks_order: this.blueprint.blocks_order,
                content_blocks: this.blueprint.content,
                is_published: true,
                seo_metadata: {
                    title: this.blueprint.content.seo?.title || this.blueprint.brand_name,
                    description: this.blueprint.content.seo?.description || ''
                }
            };

            const { data, error } = await this.supabaseService.saveLandingPage(landingData);

            if (error) throw error;

            this.notificationService.show('🚀 ¡Página publicada correctamente!', 'success');
            window.open(`https://woox.ai/p/${this.slug}`, '_blank');

        } catch (err: any) {
            this.notificationService.show('❌ Error al publicar: ' + err.message, 'error');
        } finally {
            this.isPublishing = false;
        }
    }

    reset() {
        this.currentStep = 1;
        this.blueprint = null;
        this.businessInfo = '';
    }
}
