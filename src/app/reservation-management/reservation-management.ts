import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { MobileService } from '../mobile.service';
import { supabase } from '../supabase-config';
import { BookingMobileList } from './booking-mobile-list/booking-mobile-list.component';
import { getStatusClass, getStatusText, getServiceColor } from './reservation.utils';

@Component({
  selector: 'app-reservation-management',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, BookingMobileList],
  templateUrl: './reservation-management.html',
  styleUrls: ['./reservation-management.css'],
})
export class ReservationManagement implements OnInit {
  private supabase = inject(SupabaseService);
  private ns = inject(NotificationService);
  private mobileService = inject(MobileService);
  isMobile = this.mobileService.isMobile;

  activeTab: 'calendar' | 'resources' | 'blocks' | 'reports' = 'calendar';
  currentView: 'day' | 'week' | 'month' | 'list' = 'day';
  currentDate: Date = new Date();
  today: Date = new Date();
  now: Date = new Date();
  private nowTimer: any;

  // Mock KPIs
  kpis = {
    todayTotal: 14,
    todayPending: 8,
    attendanceRate: 92,
    topService: 'Limpieza Dental',
    aiBookedRate: 85
  };

  resources: any[] = [];
  timeSlots: string[] = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
  ];
  bookings: any[] = [];
  searchTerm: string = '';
  bookingSearchTerm: string = '';
  weekDays: Date[] = [];
  monthDays: any[] = []; // { date: Date, isCurrentMonth: boolean }[]
  selectedBooking: any = null;

  selectedResourceId: string = 'all';
  currentPage: number = 1;
  pageSize: number = 10;
  merchantId: string = '';
  merchantName: string = '';

  // Resource Creator State
  showResourceModal: boolean = false;
  isEditingResource: boolean = false;
  activeResource: any = {
    name: '',
    type: 'service',
    duration_minutes: 45,
    buffer_time_minutes: 15,
    capacity: 1,
    base_price: 0,
    services: [], // Nueva lista de sub-servicios
    external_sync_url: '',
    min_stay_nights: 1,
    max_pax: 2
  };

  // Blocks (Exceptions) State
  exceptions: any[] = [];
  showBlockModal: boolean = false;
  isEditingBlock: boolean = false;
  activeBlock: any = {
    resource_id: null,
    start_datetime: '',
    end_datetime: '',
    reason: '',
    is_block: true
  };

  // Manual Booking State
  showManualBookingModal: boolean = false;
  activeManualBooking: any = {
    customer_name: '',
    customer_phone: '',
    resource_id: null,
    start_date: '',
    start_time: '',
    pax: 1,
    service_id: null
  };

  activeResourceServices: any[] = [];

  // Wizard & Layout State
  showWizard: boolean = false;
  resourceLayout: 'grid' | 'list' = 'grid';

  async ngOnInit() {
    this.merchantId = localStorage.getItem('active_merchant_id') || '';
    this.merchantName = localStorage.getItem('merchant_name') || 'Mi Negocio';

    if (this.merchantId) {
      this.fetchMerchantInfo();
      this.loadRealData();
    }

    if (this.isMobile()) {
      this.currentView = 'list';
    }
    
    // Timer para la linea de tiempo
    this.nowTimer = setInterval(() => {
      this.now = new Date();
    }, 60000); // Actualizar cada minuto
  }

  ngOnDestroy() {
    if (this.nowTimer) clearInterval(this.nowTimer);
  }

  get currentTimePosition(): number {
    const h = this.now.getHours();
    const m = this.now.getMinutes();
    
    // Buscamos el inicio de nuestro timeSlots (ej: 08:00)
    const startHour = 8;
    const totalMinutes = (h - startHour) * 60 + m;
    
    // Cada slot de 30 min mide 80px (según el CSS anterior, pero voy a ajustarlo)
    // Digamos que cada minuto son X píxeles
    // En el CSS actual .time-cell es 80px (que son 30 min)
    // Entonces 1 min = 80/30 = 2.66px
    return totalMinutes * (80 / 30) + 40; // +40 por el header cell
  }

  // getServiceColor is now handled by utils assignment below


  get displayResources() {
    if (this.selectedResourceId === 'all') return this.resources;
    return this.resources.filter(r => r.id === this.selectedResourceId);
  }

  async fetchMerchantInfo() {
    const { data, error } = await supabase
      .from('merchants')
      .select('name')
      .eq('id', this.merchantId)
      .single();

    if (data) {
      this.merchantName = data.name;
    } else {
      console.warn('No se pudo cargar la info del comercio');
      this.merchantName = 'Mi Comercio';
    }
  }

  // --- TEMPLATE WIZARD LOGIC ---
  async applyTemplate(type: 'restaurant' | 'hotel' | 'airbnb' | 'beauty' | 'coworking' | 'sports' | 'medical') {
    if (!this.merchantId) {
      this.ns.show('No se encontró un ID de comercio activo. Por favor, recarga la página.', 'error');
      return;
    }
    const confirmMsg = '¿Deseas aplicar esta plantilla? Se crearán recursos de ejemplo para tu negocio.';
    if (!confirm(confirmMsg)) return;

    if (type === 'restaurant') {
      // Crear mesas
      const tables = [
        { name: 'Mesa 01 (Terraza)', type: 'table', capacity: 2, base_price: 20000 },
        { name: 'Mesa 02 (Terraza)', type: 'table', capacity: 4, base_price: 40000 },
        { name: 'Mesa VIP 01', type: 'table', capacity: 6, base_price: 150000 },
      ];
      for (const t of tables) {
        const { error } = await supabase.from('reservable_resources').insert([{ ...t, merchant_id: this.merchantId }]);
        if (error) console.error('Error insertando mesa:', error);
      }
    } else if (type === 'hotel') {
      const rooms = [
        { name: 'Habitación Estándar', type: 'room_type', capacity: 2, base_price: 180000 },
        { name: 'Junior Suite', type: 'room_type', capacity: 3, base_price: 250000 },
        { name: 'Suite Presidencial', type: 'room_type', capacity: 4, base_price: 600000 },
      ];
      for (const r of rooms) {
        const { error } = await supabase.from('reservable_resources').insert([{ ...r, merchant_id: this.merchantId }]);
        if (error) console.error('Error insertando habitación:', error);
      }
    } else if (type === 'airbnb') {
      const properties = [
        { name: 'Cabaña Alpina (Bosque)', type: 'property', capacity: 4, base_price: 450000 },
        { name: 'Apartamento Vista al Mar', type: 'property', capacity: 2, base_price: 320000 },
      ];
      for (const p of properties) {
        const { error } = await supabase.from('reservable_resources').insert([{ ...p, merchant_id: this.merchantId }]);
        if (error) console.error('Error insertando propiedad:', error);
      }
    } else if (type === 'beauty') {
      const { data: res } = await supabase.from('reservable_resources').insert({
        name: 'Estilista Principal',
        type: 'service',
        merchant_id: this.merchantId
      }).select().single();

      if (res) {
        const { error } = await supabase.from('resource_services').insert([
          { resource_id: res.id, name: 'Corte de Dama', duration_minutes: 45, price: 65000 },
          { resource_id: res.id, name: 'Cepillado', duration_minutes: 30, price: 25000 }
        ]);
        if (error) console.error('Error insertando servicios beauty:', error);
      }
    } else if (type === 'coworking') {
      const spaces = [
        { name: 'Hot Desk - Zona A', type: 'table', capacity: 1, base_price: 15000 },
        { name: 'Sala de Juntas (8 pax)', type: 'table', capacity: 8, base_price: 85000 },
        { name: 'Oficina Privada 101', type: 'property', capacity: 4, base_price: 250000 },
      ];
      for (const s of spaces) {
        await supabase.from('reservable_resources').insert([{ ...s, merchant_id: this.merchantId }]);
      }
    } else if (type === 'sports') {
      const courts = [
        { name: 'Cancha de Pádel 1', type: 'table', capacity: 4, base_price: 120000 },
        { name: 'Cancha de Pádel 2', type: 'table', capacity: 4, base_price: 120000 },
        { name: 'Cancha de Fútbol 5', type: 'table', capacity: 10, base_price: 180000 },
      ];
      for (const c of courts) {
        await supabase.from('reservable_resources').insert([{ ...c, merchant_id: this.merchantId }]);
      }
    } else if (type === 'medical') {
      const { data: doc } = await supabase.from('reservable_resources').insert({
        name: 'Dr. Alejandro Martínez (Med. General)',
        type: 'service',
        merchant_id: this.merchantId
      }).select().single();

      if (doc) {
        await supabase.from('resource_services').insert([
          { resource_id: doc.id, name: 'Consulta Médica', duration_minutes: 20, price: 90000 },
          { resource_id: doc.id, name: 'Lectura de Exámenes', duration_minutes: 15, price: 45000 }
        ]);
      }
    }

    this.ns.show('Plantilla aplicada con éxito', 'success');
    this.showWizard = false;
    this.loadRealData();
  }

  async loadRealData() {
    // CARGAR RECURSOS
    const { data: resData, error: resError } = await supabase
      .from('reservable_resources')
      .select('*')
      .eq('merchant_id', this.merchantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (resError) {
      console.error('ERROR CRÍTICO SUPABASE (Recursos):', resError);
      this.ns.show(`Error de base de datos: ${resError.message}. Verifica si las tablas existen.`, 'error');
    } else {
      this.resources = resData || [];
    }

    // CARGAR BOOKINGS REALEZ DE SUPABASE
    const { data: bookData, error: bookError } = await supabase
      .from('bookings')
      .select('*, reservable_resources(name), customers(full_name)')
      .eq('merchant_id', this.merchantId)
      .in('status', ['confirmed', 'pending', 'completed']);

    if (bookError) {
      console.error('Error al cargar bookings:', bookError);
    } else {
      this.bookings = (bookData || []).map(b => ({
        id: b.id,
        resourceId: b.resource_id,
        customerName: b.customers?.full_name || 'Sin Nombre',
        service: b.reservable_resources?.name || 'Reserva',
        time: b.start_time.split('T')[1].substring(0, 5), // 'HH:MM'
        status: b.status,
        date: b.start_time.split('T')[0]
      }));
    }

    // CARGAR BLOQUEOS
    this.loadExceptions();
    
    // Actualizar Estadísticas
    this.updateKpis();
  }

  updateKpis() {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayBookings = this.bookings.filter(b => b.date === todayStr);
    
    // Contar por servicio para el top
    const serviceCounts: any = {};
    todayBookings.forEach(b => {
      serviceCounts[b.service] = (serviceCounts[b.service] || 0) + 1;
    });
    
    let topS = 'Ninguno';
    let max = 0;
    for (const s in serviceCounts) {
      if (serviceCounts[s] > max) {
        max = serviceCounts[s];
        topS = s;
      }
    }

    this.kpis = {
      todayTotal: todayBookings.length,
      todayPending: todayBookings.filter(b => b.status === 'pending' || b.status === 'confirmed').length,
      attendanceRate: todayBookings.length > 0 ? 100 : 0, // Mocked for now
      topService: topS,
      aiBookedRate: 85 // Mocked for now
    };
  }

  async loadExceptions() {
    const { data, error } = await supabase
      .from('availability_exceptions')
      .select('*, reservable_resources(name)')
      .eq('merchant_id', this.merchantId)
      .order('start_datetime', { ascending: true });

    if (error) {
      console.error('Error al cargar bloqueos:', error);
    } else {
      this.exceptions = data || [];
    }
  }

  changeTab(tab: 'calendar' | 'resources' | 'blocks' | 'reports') {
    this.activeTab = tab;
  }

  changeView(view: 'day' | 'week' | 'month' | 'list') {
    this.currentView = view;
    this.updateCalendarData();
  }

  updateCalendarData() {
    if (this.currentView === 'week') {
      this.generateWeekDays();
    } else if (this.currentView === 'month') {
      this.generateMonthDays();
    }
  }

  generateWeekDays() {
    const start = new Date(this.currentDate);
    const day = start.getDay();
    start.setDate(start.getDate() - day); // Ir al domingo

    this.weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      this.weekDays.push(d);
    }
  }

  generateMonthDays() {
    const startOfMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
    const endOfMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);

    const start = new Date(startOfMonth);
    start.setDate(start.getDate() - start.getDay()); // Ir al domingo previo

    const end = new Date(endOfMonth);
    if (end.getDay() < 6) {
      end.setDate(end.getDate() + (6 - end.getDay())); // Ir al sábado siguiente
    }

    this.monthDays = [];
    const curr = new Date(start);
    while (curr <= end) {
      this.monthDays.push({
        date: new Date(curr),
        isCurrentMonth: curr.getMonth() === this.currentDate.getMonth()
      });
      curr.setDate(curr.getDate() + 1);
    }
  }

  getStatusText = getStatusText;
  getStatusClass = getStatusClass;
  getServiceColor = getServiceColor;

  getBookingsForSlot(resourceId: string, time: string) {
    const targetDate = this.currentDate.toISOString().split('T')[0];
    return this.bookings.filter(b => b.resourceId === resourceId && b.time === time && b.date === targetDate);
  }

  getResourceName(id: string): string {
    const res = this.resources.find(r => r.id === id);
    return res ? res.name : 'Recurso';
  }

  getBookingsForDay(date: Date) {
    if (!date) return [];
    const targetDate = date.toISOString().split('T')[0];
    return this.bookings.filter(b => b.date === targetDate);
  }

  getBookingsForDayAndResource(date: Date, resourceId: string) {
    if (!date || !resourceId) return [];
    const targetDate = date.toISOString().split('T')[0];
    return this.bookings.filter(b => b.date === targetDate && b.resourceId === resourceId);
  }

  // Getters para filtros
  get filteredResources() {
    if (!this.searchTerm) return this.resources;
    return this.resources.filter(r =>
      r.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      r.type.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  get filteredBookings() {
    let filtered = this.bookings;

    // En vista Lista no filtramos por fecha actual para ver historial/futuro
    if (this.currentView === 'list' || this.currentView === 'month') {
        // En estas vistas mostramos todo o filtramos por término de búsqueda si existe
    } else {
      const dateStr = this.currentDate.toISOString().split('T')[0];
      filtered = filtered.filter(b => b.date === dateStr);
    }

    if (this.bookingSearchTerm) {
      const term = this.bookingSearchTerm.toLowerCase();
      filtered = filtered.filter(b =>
        b.customerName.toLowerCase().includes(term) ||
        b.service.toLowerCase().includes(term)
      );
    }
    return filtered;
  }

  get paginatedBookings() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredBookings.slice(start, start + this.pageSize);
  }

  get totalPages() {
    return Math.ceil(this.filteredBookings.length / this.pageSize);
  }

  setPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  openBookingDetails(booking: any) {
    this.selectedBooking = booking;
    if (booking) this.mobileService.setImmersive(true);
  }

  closeDetails() {
    this.selectedBooking = null;
    this.mobileService.setImmersive(false);
  }

  // --- Resource Management ---
  async openResourceCreator(resource: any = null) {
    this.showResourceModal = true;
    this.mobileService.setImmersive(true);

    if (resource) {
      this.isEditingResource = true;
      this.activeResource = {
        ...resource,
        services: []
      };

      // Cargar los servicios reales de este recurso en segundo plano
      const { data, error } = await supabase
        .from('resource_services')
        .select('*')
        .eq('resource_id', resource.id);

      if (!error && data) {
        this.activeResource.services = data;
      }
    } else {
      this.isEditingResource = false;
      this.activeResource = {
        name: '',
        type: 'service',
        duration_minutes: 45,
        buffer_time_minutes: 15,
        capacity: 1,
        base_price: 0,
        services: [],
        external_sync_url: '',
        min_stay_nights: 1,
        max_pax: 2
      };
    }
  }

  async deleteResource(id: string) {
    if (!confirm('¿Estás seguro de eliminar este recurso? Se borrarán sus servicios y disponibilidad asociada.')) return;

    const { error } = await supabase
      .from('reservable_resources')
      .delete()
      .eq('id', id);

    if (error) {
      this.ns.show('Error al eliminar: ' + error.message, 'error');
    } else {
      this.ns.show('Recurso eliminado', 'success');
      this.loadRealData();
    }
  }

  closeResourceCreator() {
    this.showResourceModal = false;
    this.mobileService.setImmersive(false);
  }

  async saveResource() {
    if (!this.activeResource.name) {
      this.ns.show('El nombre es requerido para el recurso', 'warning');
      return;
    }

    const payload = {
      merchant_id: this.merchantId,
      name: this.activeResource.name,
      type: this.activeResource.type,
      duration_minutes: this.activeResource.duration_minutes,
      buffer_time_minutes: this.activeResource.buffer_time_minutes,
      capacity: this.activeResource.capacity,
      base_price: this.activeResource.base_price,
      external_sync_url: this.activeResource.external_sync_url || null,
      min_stay_nights: this.activeResource.min_stay_nights || 1,
      max_pax: this.activeResource.max_pax || this.activeResource.capacity,
      is_active: true
    };

    let resourceId = this.isEditingResource ? this.activeResource.id : null;

    if (!this.isEditingResource) {
      const { data, error } = await supabase
        .from('reservable_resources')
        .insert([payload])
        .select()
        .single();

      if (error) {
        this.ns.show('Error al crear recurso: ' + error.message, 'error');
        return;
      }
      resourceId = data.id;
      this.ns.show('Recurso creado exitosamente', 'success');
    } else {
      const { error } = await supabase
        .from('reservable_resources')
        .update(payload)
        .eq('id', resourceId);

      if (error) {
        this.ns.show('Error al actualizar: ' + error.message, 'error');
        return;
      }
      this.ns.show('Recurso actualizado', 'success');
    }

    // --- MANEJAR SUB-SERVICIOS ---
    if (resourceId && this.activeResource.services) {
      // 1. Borrar servicios anteriores si estamos editando
      if (this.isEditingResource) {
        await supabase.from('resource_services').delete().eq('resource_id', resourceId);
      }

      // 2. Insertar los nuevos (si hay)
      if (this.activeResource.services.length > 0) {
        const servicesToInsert = this.activeResource.services.map((s: any) => ({
          resource_id: resourceId,
          name: s.name,
          duration_minutes: s.duration_minutes,
          price: s.price,
          is_active: true
        }));

        const { error: sErr } = await supabase.from('resource_services').insert(servicesToInsert);
        if (sErr) console.error('Error insertando servicios:', sErr);
      }
    }

    this.loadRealData();
    this.closeResourceCreator();
  }

  addServiceToResource() {
    if (!this.activeResource.services) this.activeResource.services = [];
    this.activeResource.services.push({
      name: '',
      duration_minutes: 30,
      price: 0
    });
  }

  removeServiceFromResource(index: number) {
    this.activeResource.services.splice(index, 1);
  }

  // --- Block Management ---
  openBlockCreator(block: any = null) {
    if (block) {
      this.isEditingBlock = true;
      this.activeBlock = {
        ...block,
        start_datetime: this.formatDateForInput(block.start_datetime),
        end_datetime: this.formatDateForInput(block.end_datetime)
      };
    } else {
      this.isEditingBlock = false;
      this.activeBlock = {
        resource_id: null,
        merchant_id: this.merchantId,
        start_datetime: '',
        end_datetime: '',
        reason: '',
        is_block: true
      };
    }
    this.showBlockModal = true;
    this.mobileService.setImmersive(true);
  }

  closeBlockCreator() {
    this.showBlockModal = false;
    this.mobileService.setImmersive(false);
  }

  private formatDateForInput(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
    const localISOTime = (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
    return localISOTime;
  }

  async saveBlock() {
    if (!this.activeBlock.start_datetime || !this.activeBlock.end_datetime) {
      this.ns.show('Las fechas son requeridas', 'warning');
      return;
    }

    const payload = {
      merchant_id: this.merchantId,
      resource_id: this.activeBlock.resource_id || null, // null significa global
      start_datetime: new Date(this.activeBlock.start_datetime).toISOString(),
      end_datetime: new Date(this.activeBlock.end_datetime).toISOString(),
      reason: this.activeBlock.reason,
      is_block: this.activeBlock.is_block
    };

    if (!this.isEditingBlock) {
      const { error } = await supabase
        .from('availability_exceptions')
        .insert([payload]);

      if (error) {
        this.ns.show('Error al crear bloqueo: ' + error.message, 'error');
      } else {
        this.ns.show('Bloqueo creado exitosamente', 'success');
        this.loadExceptions();
      }
    } else {
      const { error } = await supabase
        .from('availability_exceptions')
        .update(payload)
        .eq('id', this.activeBlock.id);

      if (error) {
        this.ns.show('Error al actualizar: ' + error.message, 'error');
      } else {
        this.ns.show('Bloqueo actualizado', 'success');
        this.loadExceptions();
      }
    }
    this.closeBlockCreator();
  }

  // --- Manual Booking ---
  openManualBooking() {
    this.activeManualBooking = {
      customer_name: '',
      customer_phone: '',
      resource_id: this.resources.length > 0 ? this.resources[0].id : null,
      start_date: new Date().toISOString().split('T')[0],
      start_time: '09:00',
      pax: 1,
      service_id: null
    };
    this.onManualResourceChange();
    this.showManualBookingModal = true;
    this.mobileService.setImmersive(true);
  }

  async onManualResourceChange() {
    this.activeResourceServices = [];
    this.activeManualBooking.service_id = null;

    if (this.activeManualBooking.resource_id) {
      const { data } = await supabase
        .from('resource_services')
        .select('*')
        .eq('resource_id', this.activeManualBooking.resource_id)
        .eq('is_active', true);

      this.activeResourceServices = data || [];
    }
  }

  onManualServiceChange() {
    const service = this.activeResourceServices.find(s => s.id === this.activeManualBooking.service_id);
    if (service) {
      // Opcional: Podríamos mostrar el precio o la duración estimada en la UI
    }
  }

  closeManualBooking() {
    this.showManualBookingModal = false;
    this.mobileService.setImmersive(false);
  }

  async saveManualBooking() {
    if (!this.activeManualBooking.customer_name || !this.activeManualBooking.resource_id) {
      this.ns.show('Nombre de cliente y recurso son obligatorios', 'warning');
      return;
    }

    // 1. Asegurar / Crear Cliente
    let customerId: string;
    const { data: custData, error: custError } = await supabase
      .from('customers')
      .select('id')
      .eq('merchant_id', this.merchantId)
      .eq('phone', this.activeManualBooking.customer_phone)
      .maybeSingle();

    if (custData) {
      customerId = custData.id;
    } else {
      const { data: newCust, error: newCustErr } = await supabase
        .from('customers')
        .insert({
          merchant_id: this.merchantId,
          full_name: this.activeManualBooking.customer_name,
          phone: this.activeManualBooking.customer_phone
        })
        .select('id')
        .single();

      if (newCustErr) {
        this.ns.show('Error creando cliente: ' + newCustErr.message, 'error');
        return;
      }
      customerId = newCust.id;
    }

    // 2. Crear Reserva
    const resource = this.resources.find(r => r.id === this.activeManualBooking.resource_id);
    const service = this.activeResourceServices.find(s => s.id === this.activeManualBooking.service_id);

    // Priorizamos la duración del servicio, si no la del recurso
    const duration = service?.duration_minutes || resource?.duration_minutes || 60;

    const start = new Date(`${this.activeManualBooking.start_date}T${this.activeManualBooking.start_time}`);
    const end = new Date(start.getTime() + duration * 60000);

    const { error: bookError } = await supabase
      .from('bookings')
      .insert({
        merchant_id: this.merchantId,
        customer_id: customerId,
        resource_id: this.activeManualBooking.resource_id,
        service_id: this.activeManualBooking.service_id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: 'confirmed',
        pax: this.activeManualBooking.pax,
        channel: 'manual'
      });

    if (bookError) {
      this.ns.show('Error al crear reserva: ' + bookError.message, 'error');
    } else {
      this.ns.show('Reserva manual creada con éxito', 'success');
      this.loadRealData();
      this.closeManualBooking();
    }
  }

  async deleteBlock(id: string) {
    if (confirm('¿Estás seguro de eliminar este bloqueo?')) {
      const { error } = await supabase
        .from('availability_exceptions')
        .delete()
        .eq('id', id);

      if (error) {
        this.ns.show('Error al eliminar', 'error');
      } else {
        this.ns.show('Bloqueo eliminado', 'success');
        this.loadExceptions();
      }
    }
  }

  // Handled by imports and utils


  navigateDate(change: number) {
    if (this.currentView === 'day') {
      this.currentDate.setDate(this.currentDate.getDate() + change);
    } else if (this.currentView === 'week') {
      this.currentDate.setDate(this.currentDate.getDate() + (change * 7));
    } else if (this.currentView === 'month') {
      this.currentDate.setMonth(this.currentDate.getMonth() + change);
    }
    this.currentDate = new Date(this.currentDate);
    this.updateCalendarData();
  }
}

