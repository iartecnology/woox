import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

interface BioLinkButton {
    id: string;
    label: string;
    url: string;
    icon?: string;
    is_active: boolean;
    style?: 'solid' | 'outline' | 'ghost';
}

interface BioLinkConfig {
    enabled: boolean;
    title: string;
    description: string;
    background_type: 'color' | 'gradient' | 'image';
    background_value: string;
    button_style: 'rounded' | 'square' | 'pill';
    text_color: string;
    buttons: BioLinkButton[];
    social_links: { platform: string, url: string }[];
}

interface Merchant {
    id: string;
    name: string;
    slug: string;
    logo_url: string;
    primary_color: string;
    biolink?: BioLinkConfig;
}

@Component({
    selector: 'app-biolink-page',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './biolink-page.component.html',
    styleUrl: './biolink-page.component.css'
})
export class BiolinkPageComponent implements OnInit {
    private route = inject(ActivatedRoute);
    merchant: Merchant | null = null;
    notFound = false;

    // Mock data replicated from SuperAdmin
    merchants: Merchant[] = [
        {
            id: '1',
            name: 'Burgers & Co',
            slug: 'burgers-co',
            logo_url: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=200&h=200&fit=crop',
            primary_color: '#E11D48',
            biolink: {
                enabled: true,
                title: 'Burgers & Co VIP',
                description: '¡Bienvenidos a nuestra página de enlaces!',
                background_type: 'gradient',
                background_value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                button_style: 'pill',
                text_color: '#ffffff',
                buttons: [
                    { id: '1', label: 'Ver Menú / Catálogo', icon: 'fa-solid fa-utensils', url: '#', is_active: true, style: 'solid' },
                    { id: '2', label: 'Hablar por WhatsApp', icon: 'fa-brands fa-whatsapp', url: '#', is_active: true, style: 'solid' }
                ],
                social_links: []
            }
        },
        { id: '2', name: 'Pizza Woox', slug: 'pizza-woox', logo_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&h=200&fit=crop', primary_color: '#F59E0B' },
        { id: '3', name: 'Sushi Express', slug: 'sushi-express', logo_url: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=200&h=200&fit=crop', primary_color: '#EF4444' },
    ];

    platformName = 'Woox';
    showShareMenu = false;

    ngOnInit() {
        this.platformName = localStorage.getItem('platform_name') || 'Woox';

        this.route.params.subscribe(params => {
            const slug = params['slug'];
            const found = this.merchants.find(m => m.slug === slug);

            if (found) {
                this.merchant = found;
                if (!this.merchant.biolink) {
                    // Default fallback biolink if not configured
                    this.merchant.biolink = {
                        enabled: true,
                        title: this.merchant.name,
                        description: 'Visita nuestros enlaces oficiales',
                        background_type: 'color',
                        background_value: this.merchant.primary_color,
                        button_style: 'rounded',
                        text_color: '#ffffff',
                        buttons: [
                            { id: '1', label: 'WhatsApp', url: '#', is_active: true, style: 'solid' }
                        ],
                        social_links: []
                    };
                }
            } else {
                this.notFound = true;
            }
        });
    }

    async share() {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: this.merchant?.biolink?.title || this.merchant?.name,
                    text: this.merchant?.biolink?.description,
                    url: window.location.href
                });
            } catch (err) {
                console.error('Error sharing:', err);
            }
        } else {
            // Fallback: copiar al portapapeles
            navigator.clipboard.writeText(window.location.href);
            alert('¡Enlace copiado al portapapeles!');
        }
    }
}
