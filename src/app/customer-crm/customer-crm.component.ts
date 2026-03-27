import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { supabase } from '../supabase-config';
import { MobileService } from '../mobile.service';

interface Customer {
    id: string;
    full_name: string;
    phone: string;
    email: string;
    total_orders: number;
    clv: number;
    last_purchase_at: Date;
    channel_preference: string;
    sentiment: 'happy' | 'neutral' | 'frustrated';
    tags: string[];
    loyalty_level: 'bronze' | 'silver' | 'gold' | 'platinum';
    churn_risk: 'low' | 'medium' | 'high';
}

interface CampaignResult {
    sent: number;
    failed: number;
    total: number;
}

@Component({
    selector: 'app-customer-crm',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './customer-crm.component.html',
    styleUrl: './customer-crm.component.css'
})
export class CustomerCrmComponent implements OnInit {
    private supabaseService = inject(SupabaseService);
    public mobileService = inject(MobileService);
    customers: Customer[] = [];
    merchantId: string = '';

    filteredCustomers: Customer[] = [];
    searchTerm: string = '';
    selectedCustomer: Customer | null = null;
    showCampaignModal = false;
    isSending = false;
    campaignResult: CampaignResult | null = null;
    campaignHistory: any[] = [];
    segmentCount = 0;
    activeFilter: 'all' | 'vip' | 'churn' | 'new' | 'inactive' = 'all';

    campaign = {
        name: '',
        message: '',
        segment: 'all'
    };

    SEGMENT_LABELS: Record<string, string> = {
        all: 'Todos los clientes',
        vip: 'VIPs (Gold & Platinum) ⭐',
        churn: 'En Riesgo de Abandono 🔴',
        happy: 'Clientes Felices 😊',
        inactive: 'Inactivos (+15 días) 💤'
    };

    constructor() { }

    ngOnInit(): void {
        this.mobileService.setHeader('Clientes', false);
        this.merchantId = localStorage.getItem('active_merchant_id') || '';
        this.loadCustomers();
        this.loadCampaignHistory();
    }

    isMobile(): boolean {
        return this.mobileService.isMobile();
    }

    async loadCustomers() {
        if (!this.merchantId) return;
        const { data } = await this.supabaseService.getMerchantCustomers(this.merchantId);
        if (data) {
            this.customers = data as unknown as Customer[];
            this.applyFilter();
            if (this.customers.length > 0 && !this.isMobile()) {
                this.selectedCustomer = this.filteredCustomers[0];
            }
        }
    }

    setFilter(filter: 'all' | 'vip' | 'churn' | 'new' | 'inactive') {
        this.activeFilter = filter;
        this.searchTerm = '';
        this.applyFilter();
    }

    applyFilter() {
        const now15 = new Date();
        now15.setDate(now15.getDate() - 15);

        let base = this.customers;

        switch (this.activeFilter) {
            case 'vip':
                base = this.customers.filter(c => c.loyalty_level === 'gold' || c.loyalty_level === 'platinum');
                break;
            case 'churn':
                base = this.customers.filter(c => c.churn_risk === 'high');
                break;
            case 'new':
                base = this.customers.filter(c => (c.total_orders || 0) <= 1);
                break;
            case 'inactive':
                base = this.customers.filter(c => !c.last_purchase_at || new Date(c.last_purchase_at) < now15);
                break;
            default:
                base = this.customers;
        }

        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            base = base.filter(c =>
                c.full_name?.toLowerCase().includes(term) ||
                c.phone?.includes(term)
            );
        }

        this.filteredCustomers = base;
    }

    getFilterCount(filter: string): number {
        const now15 = new Date();
        now15.setDate(now15.getDate() - 15);
        switch (filter) {
            case 'vip': return this.customers.filter(c => c.loyalty_level === 'gold' || c.loyalty_level === 'platinum').length;
            case 'churn': return this.customers.filter(c => c.churn_risk === 'high').length;
            case 'new': return this.customers.filter(c => (c.total_orders || 0) <= 1).length;
            case 'inactive': return this.customers.filter(c => !c.last_purchase_at || new Date(c.last_purchase_at) < now15).length;
            default: return this.customers.length;
        }
    }

    async loadCampaignHistory() {
        if (!this.merchantId) return;
        const { data } = await supabase
            .from('campaign_logs')
            .select('*')
            .eq('merchant_id', this.merchantId)
            .order('sent_at', { ascending: false })
            .limit(5);
        this.campaignHistory = data || [];
    }

    search() {
        this.applyFilter();
    }

    selectCustomer(customer: Customer) {
        this.selectedCustomer = customer;
        if (this.isMobile()) {
            this.mobileService.setImmersive(true);
            this.mobileService.setHeader(customer.full_name || 'Cliente', true, () => this.goBackToList());
        }
    }

    goBackToList() {
        this.selectedCustomer = null;
        if (this.isMobile()) {
            this.mobileService.setImmersive(false);
            this.mobileService.setHeader('Clientes', false);
        }
    }

    openCampaignModal() {
        this.campaignResult = null;
        this.campaign = { name: '', message: '', segment: 'all' };
        this.updateSegmentCount();
        this.showCampaignModal = true;
    }

    onSegmentChange() {
        this.updateSegmentCount();
    }

    updateSegmentCount() {
        const seg = this.campaign.segment;
        const now = new Date();
        now.setDate(now.getDate() - 15);

        if (seg === 'all') this.segmentCount = this.customers.length;
        else if (seg === 'vip') this.segmentCount = this.customers.filter(c => c.loyalty_level === 'gold' || c.loyalty_level === 'platinum').length;
        else if (seg === 'churn') this.segmentCount = this.customers.filter(c => c.churn_risk === 'high').length;
        else if (seg === 'happy') this.segmentCount = this.customers.filter(c => c.sentiment === 'happy').length;
        else if (seg === 'inactive') this.segmentCount = this.customers.filter(c => c.last_purchase_at && new Date(c.last_purchase_at) < now).length;
    }

    async sendCampaign() {
        if (!this.campaign.name || !this.campaign.message) {
            alert('Por favor completa el nombre de la campaña y el mensaje.');
            return;
        }

        this.isSending = true;
        this.campaignResult = null;

        try {
            const { data, error } = await supabase.functions.invoke('remarketing-campaign', {
                body: {
                    merchant_id: this.merchantId,
                    campaign_name: this.campaign.name,
                    message: this.campaign.message,
                    segment: this.campaign.segment
                }
            });

            if (error) throw error;
            this.campaignResult = data as CampaignResult;
            this.loadCampaignHistory();
        } catch (err: any) {
            console.error('[Campaign Error]', err);
            this.campaignResult = { sent: 0, failed: 0, total: 0 };
        } finally {
            this.isSending = false;
        }
    }

    closeCampaignModal() {
        this.showCampaignModal = false;
        this.campaignResult = null;
    }

    getSentimentEmoji(sentiment: string): string {
        switch (sentiment) {
            case 'happy': return '😊';
            case 'neutral': return '😐';
            case 'frustrated': return '😡';
            default: return '😐';
        }
    }

    getChannelIcon(channel: string): string {
        switch (channel) {
            case 'whatsapp': return '💬';
            case 'telegram': return '✈️';
            case 'instagram': return '📸';
            case 'web': return '🌐';
            default: return '💬';
        }
    }

    getLoyaltyIcon(level: string): string {
        switch (level) {
            case 'platinum': return '💎';
            case 'gold': return '⭐';
            case 'silver': return '🥈';
            default: return '🥉';
        }
    }

    formatCurrency(value: number) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value || 0);
    }

    get totalClv(): number {
        return this.customers.reduce((sum, c) => sum + (c.clv || 0), 0);
    }

    get vipCount(): number {
        return this.customers.filter(c => c.loyalty_level === 'gold' || c.loyalty_level === 'platinum').length;
    }

    get churnCount(): number {
        return this.customers.filter(c => c.churn_risk === 'high').length;
    }
}
