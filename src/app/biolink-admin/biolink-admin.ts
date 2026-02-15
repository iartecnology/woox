import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationService } from '../notification.service';

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
  gradient_color1?: string;
  gradient_color2?: string;
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
  biolink?: BioLinkConfig;
}

@Component({
  selector: 'app-biolink-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './biolink-admin.html',
  styleUrl: './biolink-admin.css',
})
export class BiolinkAdminComponent implements OnInit {
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  merchant: Merchant = {
    id: '',
    name: '',
    slug: '',
    logo_url: ''
  };

  biolinkPresets = [
    { name: 'Instagram', icon: 'fa-brands fa-instagram' },
    { name: 'WhatsApp', icon: 'fa-brands fa-whatsapp' },
    { name: 'Facebook', icon: 'fa-brands fa-facebook' },
    { name: 'TikTok', icon: 'fa-brands fa-tiktok' },
    { name: 'YouTube', icon: 'fa-brands fa-youtube' },
    { name: 'Twitter/X', icon: 'fa-brands fa-x-twitter' },
    { name: 'LinkedIn', icon: 'fa-brands fa-linkedin' },
    { name: 'Telegram', icon: 'fa-brands fa-telegram' },
    { name: 'Web', icon: 'fa-solid fa-globe' },
    { name: 'Carrito', icon: 'fa-solid fa-cart-shopping' },
    { name: 'Menú', icon: 'fa-solid fa-utensils' },
    { name: 'Ubicación', icon: 'fa-solid fa-location-dot' },
    { name: 'Llamar', icon: 'fa-solid fa-phone' },
    { name: 'Email', icon: 'fa-solid fa-envelope' }
  ];

  ngOnInit() {
    // Cargar datos del merchant desde localStorage
    const merchantId = localStorage.getItem('active_merchant_id');
    const merchantName = localStorage.getItem('merchant_name');
    const merchantSlug = localStorage.getItem('merchant_slug');

    // Mock data - en producción esto vendría de un servicio
    this.merchant = {
      id: merchantId || '1',
      name: merchantName || 'Mi Empresa',
      slug: merchantSlug || merchantName?.toLowerCase().replace(/ /g, '-') || 'mi-empresa',
      logo_url: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=200&h=200&fit=crop'
    };

    // Inicializar BioLink si no existe
    if (!this.merchant.biolink) {
      this.merchant.biolink = {
        enabled: true,
        title: this.merchant.name,
        description: '¡Bienvenidos a nuestra página de enlaces!',
        background_type: 'gradient',
        background_value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        gradient_color1: '#667eea',
        gradient_color2: '#764ba2',
        button_style: 'pill',
        text_color: '#ffffff',
        buttons: [
          { id: '1', label: 'Ver Menú / Catálogo', icon: 'fa-solid fa-utensils', url: '#', is_active: true, style: 'solid' },
          { id: '2', label: 'Hablar por WhatsApp', icon: 'fa-brands fa-whatsapp', url: '#', is_active: true, style: 'solid' }
        ],
        social_links: []
      };
    }
  }

  addBiolinkButton() {
    if (!this.merchant.biolink) return;
    this.merchant.biolink.buttons.push({
      id: Date.now().toString(),
      label: 'Nuevo Enlace',
      url: 'https://',
      is_active: true,
      style: 'solid'
    });
  }

  removeBiolinkButton(index: number) {
    this.merchant.biolink?.buttons.splice(index, 1);
  }

  setIcon(link: any, icon: string) {
    link.icon = icon;
  }

  updateGradient() {
    if (this.merchant.biolink) {
      const bio = this.merchant.biolink;
      if (bio.gradient_color1 && bio.gradient_color2) {
        bio.background_value = `linear-gradient(135deg, ${bio.gradient_color1} 0%, ${bio.gradient_color2} 100%)`;
      }
    }
  }

  saveBiolinkConfig() {
    // Aquí se guardaría en el backend
    this.notificationService.show('BioLink actualizado correctamente', 'success');
  }

  getQRCodeUrl(): string {
    const url = this.getBiolinkUrl();
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  }

  async downloadQRCode() {
    const url = this.getQRCodeUrl();
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const slug = this.merchant.slug || 'comercio';
      link.setAttribute('download', `QR_${slug}.png`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      this.notificationService.show('Código QR descargado (.png)', 'success');
    } catch (error) {
      console.error('Error descargando el QR:', error);
      this.notificationService.show('Error al descargar el QR', 'error');
    }
  }

  async downloadPoster() {
    this.notificationService.show('Generando poster...', 'info');

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dibujar Fondo
    if (this.merchant.biolink?.background_type === 'gradient') {
      const grd = ctx.createLinearGradient(0, 0, 0, 1200);
      grd.addColorStop(0, this.merchant.biolink.gradient_color1 || '#667eea');
      grd.addColorStop(1, this.merchant.biolink.gradient_color2 || '#764ba2');
      ctx.fillStyle = grd;
    } else {
      ctx.fillStyle = this.merchant.biolink?.background_value || '#f1f5f9';
    }
    ctx.fillRect(0, 0, 800, 1200);

    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    };

    try {
      // Logo
      if (this.merchant.logo_url) {
        const logo = await loadImage(this.merchant.logo_url);
        const size = 200;
        const x = 400 - size / 2;
        const y = 100;

        ctx.save();
        ctx.beginPath();
        ctx.arc(400, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(logo, x, y, size, size);
        ctx.restore();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 10;
        ctx.stroke();
      }

      // Texto: Nombre
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 54px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.merchant.name || 'Empresa', 400, 380);

      // Texto: Bio
      ctx.font = '30px "Inter", sans-serif';
      ctx.fillText(this.merchant.biolink?.description || '', 400, 440, 600);

      // QR Code
      const qr = await loadImage(this.getQRCodeUrl());
      const qrSize = 400;
      const qrX = 400 - qrSize / 2;
      const qrY = 550;

      ctx.fillStyle = '#ffffff';
      ctx.roundRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, [30]);
      ctx.fill();

      ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

      // Texto pie
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px "Inter", sans-serif';
      ctx.fillText('¡Escanea para ver más!', 400, 1050);

      ctx.font = '24px "Inter", sans-serif';
      ctx.globalAlpha = 0.8;
      const platformName = localStorage.getItem('platform_name') || 'Woox';
      ctx.fillText(`Potenciado por ${platformName}`, 400, 1120);

      // Generar PDF
      // @ts-ignore
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: [800, 1200]
      });

      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, 800, 1200);

      const slug = this.merchant.slug || 'comercio';
      const filename = `Poster_QR_${slug}.pdf`;
      pdf.save(filename);

      this.notificationService.show('Poster PDF generado con éxito', 'success');

    } catch (error) {
      console.error('Error generando poster:', error);
      this.notificationService.show('Error al generar el diseño del poster', 'error');
    }
  }

  getBiolinkUrl(): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/bio/${this.merchant.slug}`;
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.notificationService.show('Copiado al portapapeles', 'success');
    });
  }

  previewBiolink() {
    window.open(this.getBiolinkUrl(), '_blank');
  }
}
