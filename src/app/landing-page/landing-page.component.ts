import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../supabase.service';
import { Title, Meta } from '@angular/platform-browser';

@Component({
    selector: 'app-landing-page',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './landing-page.component.html',
    styleUrl: './landing-page.component.css'
})
export class LandingPageComponent implements OnInit {
    landing: any = null;
    isLoading: boolean = true;
    error: string | null = null;

    private route = inject(ActivatedRoute);
    private supabaseService = inject(SupabaseService);
    private titleService = inject(Title);
    private metaService = inject(Meta);

    async ngOnInit() {
        const slug = this.route.snapshot.paramMap.get('slug');
        if (slug) {
            await this.loadLanding(slug);
        } else {
            this.error = 'No se especificó una página.';
            this.isLoading = false;
        }
    }

    async loadLanding(slug: string) {
        try {
            const { data, error } = await this.supabaseService.getLandingBySlug(slug);

            if (error || !data) {
                this.error = 'La página que buscas no existe o ha sido movida.';
            } else {
                this.landing = data;
                this.applySEO(data);
                this.injectCustomStyles(data);
            }
        } catch (err) {
            this.error = 'Ocurrió un error al cargar la página.';
        } finally {
            this.isLoading = false;
        }
    }

    applySEO(data: any) {
        const title = data.seo_metadata?.title || 'Woox AI Website';
        const description = data.seo_metadata?.description || 'Creado con Woox AI';

        this.titleService.setTitle(title);
        this.metaService.updateTag({ name: 'description', content: description });
        this.metaService.updateTag({ property: 'og:title', content: title });
        this.metaService.updateTag({ property: 'og:description', content: description });
    }

    injectCustomStyles(data: any) {
        if (!data.theme_palette) return;

        const root = document.documentElement;
        const p = data.theme_palette;

        root.style.setProperty('--landing-primary', p.primary || '#6366f1');
        root.style.setProperty('--landing-secondary', p.secondary || '#4f46e5');
        root.style.setProperty('--landing-accent', p.accent || '#a855f7');
        root.style.setProperty('--landing-bg', p.background || '#ffffff');
        root.style.setProperty('--landing-text', p.text || '#0f172a');

        if (data.typography) {
            // Inyectar fuente de Google si es necesario (simulando link dinámico)
            const link = document.createElement('link');
            link.href = `https://fonts.googleapis.com/css2?family=${data.typography.replace(/ /g, '+')}:wght@400;700;800&display=swap`;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
            root.style.setProperty('--landing-font', `'${data.typography}', sans-serif`);
        }
    }

    scrollToSection(sectionId: string) {
        const element = document.getElementById(sectionId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    }

    onAction() {
        // Aquí podrías abrir el chatbot o redirigir a WhatsApp
        this.notification('Redirigiendo al Asistente...');
    }

    notification(msg: string) {
        console.log(msg);
    }
}
