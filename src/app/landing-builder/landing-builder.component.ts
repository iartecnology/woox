import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { MobileService } from '../mobile.service';

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

    // Resultado de la IA (Blueprints)
    blueprints: any[] = [];
    selectedBlueprint: any = null;
    selectedIndex: number = -1;
    slug: string = '';

    // Estado de regeneración
    regenerateCount: number = 0;

    // UI helpers
    previewLogo: boolean = false;
    logoError: boolean = false;

    // Configuración de la plataforma
    private supabaseService = inject(SupabaseService);
    private notificationService = inject(NotificationService);
    private http = inject(HttpClient);
    private cdr = inject(ChangeDetectorRef);
    readonly mobileService = inject(MobileService);

    constructor() { }

    async ngOnInit() {
        this.mobileService.setHeader('AI Landing', false);
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
            this.blueprints = [{
                industry_type: data.industry_type,
                brand_name: data.seo_metadata?.title || '',
                content: data.content_blocks,
                theme_suggestion: {
                    palette: data.theme_palette,
                    typography: data.typography
                },
                blocks_order: data.blocks_order,
                layout_style: 'standard',
                template_name: 'Publicada'
            }];
            this.selectedBlueprint = this.blueprints[0];
            this.selectedIndex = 0;
            this.slug = data.slug;
            this.currentStep = 4; // Mostrar resumen si ya existe
        }
    }

    async generateWithAI() {
        if (!this.businessInfo || this.businessInfo.length < 20) {
            this.notificationService.show('⚠️ Por favor describe tu negocio con un poco más de detalle.', 'warning');
            return;
        }

        this.isGenerating = true;
        this.currentStep = 2;
        this.regenerateCount = 0;

        const payload = {
            merchant_id: this.merchantId,
            business_info: this.businessInfo,
            logo_url: this.logoUrl,
            regenerate_count: this.regenerateCount
        };

        const AI_ENGINE_URL = `${environment.supabaseUrl}/functions/v1/generate-landing`;
        console.log('[Landing Builder] Calling Edge Function:', AI_ENGINE_URL);
        console.log('[Landing Builder] Payload:', payload);

        this.http.post(AI_ENGINE_URL, payload, {
            headers: {
                'Authorization': `Bearer ${environment.supabaseAnonKey}`,
                'Content-Type': 'application/json'
            }
        }).subscribe({
            next: (res: any) => {
                console.log('[Landing Builder] Response:', res);
                this.processResponse(res);
            },
            error: (err) => {
                console.error('[Landing Builder] HTTP Error:', err);
                console.error('[Landing Builder] Status:', err.status);
                console.error('[Landing Builder] Error body:', err.error);

                let msg = '❌ No se pudo conectar con el servicio de generación.';
                if (err.status === 0) {
                    msg = '❌ Error de red: Verifica tu conexión o que la Edge Function esté desplegada.';
                } else if (err.status === 401) {
                    msg = '❌ Error de Autenticación: La API Key no tiene permisos.';
                } else if (err.status === 404) {
                    msg = '❌ La Edge Function "generate-landing" no está desplegada en Supabase.\nEjecuta: npx supabase functions deploy generate-landing';
                } else if (err.status === 500) {
                    msg = '❌ Error interno del servidor: ' + (err.error?.error || 'Verifica GEMINI_API_KEY en Supabase.');
                }

                this.notificationService.show(msg, 'error');
                this.isGenerating = false;
                this.currentStep = 1;
                this.cdr.detectChanges();
            }
        });
    }

    processResponse(res: any) {
        // El bot engine devuelve un array de variants o un solo blueprint
        if (res && res.variants && res.variants.length > 0) {
            this.blueprints = res.variants;
            this.notificationService.show(`✨ ¡${this.blueprints.length} diseños generados con éxito!`, 'success');
            this.isGenerating = false;
            this.currentStep = 3;
        } else if (res && !res.error) {
            // Fallback si devuelve un solo blueprint
            this.blueprints = [{ ...res, layout_style: 'standard', template_name: 'Clásica' }];
            this.notificationService.show('✨ ¡Landing Page generada con éxito!', 'success');
            this.isGenerating = false;
            this.currentStep = 3;
        } else if (res?.error) {
            this.notificationService.show('❌ Error de la IA: ' + res.error, 'error');
            this.isGenerating = false;
            this.currentStep = 1;
        } else {
            this.notificationService.show('❌ Respuesta inválida del servicio.', 'error');
            this.isGenerating = false;
            this.currentStep = 1;
        }
        this.cdr.detectChanges();
    }

    /** Genera 3 plantillas mock para probar el flujo sin API */
    generateDemoMode() {
        this.isGenerating = true;
        this.currentStep = 2;
        this.regenerateCount = 0;

        const brandName = this.extractBrandName(this.businessInfo);

        // Simular delay de red
        setTimeout(() => {
            this.blueprints = [
                {
                    template_name: 'Moderno Minimalista',
                    industry_type: this.detectIndustry(this.businessInfo),
                    brand_name: brandName,
                    tone: 'Profesional y cercano',
                    layout_style: 'hero-first',
                    theme_suggestion: {
                        palette: { primary: '#6366f1', secondary: '#818cf8', accent: '#a855f7', background: '#fafbff', text: '#0f172a' },
                        typography: 'Outfit'
                    },
                    blocks_order: ['hero', 'features', 'about', 'catalog', 'location'],
                    content: {
                        hero: { title: `Bienvenido a ${brandName}`, subtitle: 'Donde la calidad y la pasión se encuentran. Descubre algo único.' },
                        features: [
                            { icon: 'zap', title: 'Rapidez', desc: 'Servicio express en menos de 30 minutos.' },
                            { icon: 'shield', title: 'Confianza', desc: 'Más de 500 clientes satisfechos.' },
                            { icon: 'heart', title: 'Calidad', desc: 'Ingredientes premium seleccionados.' }
                        ],
                        about: { title: 'Nuestra Historia', text: 'Nacimos de un sueño: ofrecer lo mejor de nuestra cocina a tu mesa. Cada plato cuenta una historia de dedicación y amor por los detalles.' },
                        seo: { title: `${brandName} - Lo mejor de la ciudad`, description: `Descubre ${brandName}. Calidad, sabor y servicio excepcional en cada experiencia.` }
                    }
                },
                {
                    template_name: 'Cálido Acogedor',
                    industry_type: this.detectIndustry(this.businessInfo),
                    brand_name: brandName,
                    tone: 'Cercano y familiar',
                    layout_style: 'features-first',
                    theme_suggestion: {
                        palette: { primary: '#f97316', secondary: '#fb923c', accent: '#eab308', background: '#fffbeb', text: '#1c1917' },
                        typography: 'DM Sans'
                    },
                    blocks_order: ['features', 'hero', 'about', 'catalog', 'location'],
                    content: {
                        hero: { title: `El Sabor de ${brandName}`, subtitle: 'Hecho con amor, servido con pasión. Tu lugar favorito para disfrutar.' },
                        features: [
                            { icon: 'star', title: 'Premium', desc: 'Solo los mejores ingredientes del mercado.' },
                            { icon: 'truck', title: 'Delivery', desc: 'Te lo llevamos a la puerta de tu casa.' },
                            { icon: 'gift', title: 'Ofertas', desc: 'Promociones especiales cada semana.' }
                        ],
                        about: { title: 'Quiénes Somos', text: 'Somos un equipo apasionado por la excelencia. En ${brandName} cada detalle importa, desde la bienvenida hasta el postre.' },
                        seo: { title: `${brandName} - Tu lugar especial`, description: `Visita ${brandName} y vive una experiencia única. Calidad y calidez en cada visita.` }
                    }
                },
                {
                    template_name: 'Elegante Premium',
                    industry_type: this.detectIndustry(this.businessInfo),
                    brand_name: brandName,
                    tone: 'Sofisticado y exclusivo',
                    layout_style: 'catalog-first',
                    theme_suggestion: {
                        palette: { primary: '#1e293b', secondary: '#334155', accent: '#94a3b8', background: '#f8fafc', text: '#0f172a' },
                        typography: 'Space Grotesk'
                    },
                    blocks_order: ['hero', 'catalog', 'features', 'about', 'location'],
                    content: {
                        hero: { title: `${brandName}: Exclusivo`, subtitle: 'Una experiencia reservada para quienes exigen lo extraordinario.' },
                        features: [
                            { icon: 'crown', title: 'Exclusivo', desc: 'Ediciones limitadas y selección curada.' },
                            { icon: 'gem', title: 'Lujo', desc: 'Materiales y acabados de primera categoría.' },
                            { icon: 'award', title: 'Galardonado', desc: 'Reconocidos por críticos y expertos.' }
                        ],
                        about: { title: 'La Filosofía', text: 'En ${brandName} creemos que la excelencia no es un acto, es un hábito. Cada creación refleja nuestro compromiso inquebrantable con la perfección.' },
                        seo: { title: `${brandName} | Experiencia Premium`, description: `Descubre la exclusiva propuesta de ${brandName}. Solo para paladares exigentes.` }
                    }
                }
            ];

            this.notificationService.show(`✨ ¡3 diseños demo generados!`, 'success');
            this.isGenerating = false;
            this.currentStep = 3;
            this.cdr.detectChanges();
        }, 2000);
    }

    extractBrandName(text: string): string {
        // Intentar extraer un nombre propio del texto
        const words = text.split(' ').filter(w => w.length > 3);
        return words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'Mi Negocio';
    }

    detectIndustry(text: string): string {
        const lower = text.toLowerCase();
        if (lower.includes('restaur') || lower.includes('comida') || lower.includes('pizza') || lower.includes('cocina')) return 'restaurant';
        if (lower.includes('hotel') || lower.includes('hosped') || lower.includes('habitacion')) return 'hotel';
        if (lower.includes('salud') || lower.includes('clinic') || lower.includes('dent')) return 'health';
        if (lower.includes('tienda') || lower.includes('producto') || lower.includes('venta')) return 'ecommerce';
        return 'services';
    }

    async regenerateTemplates() {
        if (this.regenerateCount >= 3) {
            this.notificationService.show('⚠️ Límite de regeneraciones alcanzado. Selecciona una plantilla o reinicia.', 'warning');
            return;
        }

        this.regenerateCount++;
        this.isGenerating = true;
        this.currentStep = 2;

        const payload = {
            merchant_id: this.merchantId,
            business_info: this.businessInfo,
            logo_url: this.logoUrl,
            regenerate_count: this.regenerateCount
        };

        const AI_ENGINE_URL = `${environment.supabaseUrl}/functions/v1/generate-landing`;

        this.http.post(AI_ENGINE_URL, payload, {
            headers: {
                'Authorization': `Bearer ${environment.supabaseAnonKey}`,
                'Content-Type': 'application/json'
            }
        }).subscribe({
            next: (res: any) => {
                if (res && res.variants && res.variants.length > 0) {
                    this.blueprints = res.variants;
                    this.selectedIndex = -1;
                    this.selectedBlueprint = null;
                    this.notificationService.show(`✨ ¡${this.blueprints.length} nuevos diseños generados!`, 'success');
                    this.isGenerating = false;
                    this.currentStep = 3;
                } else {
                    this.notificationService.show('❌ No se pudieron generar nuevas variantes.', 'error');
                    this.isGenerating = false;
                    this.currentStep = 3;
                }
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Regenerate Error:', err);
                this.notificationService.show('❌ Error al regenerar plantillas.', 'error');
                this.isGenerating = false;
                this.currentStep = 3;
                this.cdr.detectChanges();
            }
        });
    }

    getLayoutLabel(layout: string): string {
        const labels: Record<string, string> = {
            'hero-first': 'Hero First',
            'features-first': 'Features First',
            'catalog-first': 'Catálogo First',
            'standard': 'Estándar'
        };
        return labels[layout] || 'Estándar';
    }

    onImgError(event: Event) {
        const target = event.target as HTMLImageElement;
        target.style.display = 'none';
    }

    selectTemplate(index: number) {
        this.selectedIndex = index;
        this.selectedBlueprint = this.blueprints[index];
        this.slug = (this.selectedBlueprint.brand_name || 'mi-tienda').toLowerCase().replace(/[^a-z0-9]/g, '-');
        this.cdr.detectChanges();
    }

    goToCustomization() {
        if (this.selectedIndex < 0 || !this.selectedBlueprint) {
            this.notificationService.show('⚠️ Selecciona un diseño para continuar.', 'warning');
            return;
        }
        this.currentStep = 4;
    }

    async publishLanding() {
        if (!this.selectedBlueprint) return;
        this.isPublishing = true;

        try {
            const landingData = {
                merchant_id: this.merchantId,
                slug: this.slug,
                industry_type: this.selectedBlueprint.industry_type,
                template_id: this.selectedBlueprint.template_name?.toLowerCase().replace(/\s/g, '-') || 'custom-v1',
                theme_palette: this.selectedBlueprint.theme_suggestion.palette,
                typography: this.selectedBlueprint.theme_suggestion.typography,
                blocks_order: this.selectedBlueprint.blocks_order,
                content_blocks: this.selectedBlueprint.content,
                logo_url: this.logoUrl,
                is_published: true,
                seo_metadata: {
                    title: this.selectedBlueprint.content.seo?.title || this.selectedBlueprint.brand_name,
                    description: this.selectedBlueprint.content.seo?.description || ''
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
        this.blueprints = [];
        this.selectedBlueprint = null;
        this.selectedIndex = -1;
        this.businessInfo = '';
        this.logoUrl = '';
        this.slug = '';
        this.regenerateCount = 0;
    }
}
