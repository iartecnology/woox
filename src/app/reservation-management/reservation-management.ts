import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { supabase } from '../supabase-config';

@Component({
  selector: 'app-reservation-management',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './reservation-management.html',
  styleUrls: ['./reservation-management.css'],
})
export class ReservationManagement implements OnInit {
  private supabase = inject(SupabaseService);
  private ns = inject(NotificationService);

  activeTab: 'calendar' | 'resources' | 'blocks' | 'reports' = 'calendar';
  currentView: 'day' | 'week' | 'month' = 'day';
  currentDate: Date = new Date();

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
    '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00'
  ];
  bookings: any[] = [];

  selectedBooking: any = null;
  merchantId: string = '';

  // Resource Creator State
  showResourceModal: boolean = false;
  isEditingResource: boolean = false;
  activeResource: any = {
    name: '',
    type: 'service',
    duration_minutes: 45,
    buffer_time_minutes: 15,
    capacity: 1,
    base_price: 0
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

  ngOnInit() {
    this.merchantId = localStorage.getItem('active_merchant_id') || '';
    if (this.merchantId) {
      this.loadRealData();
    }
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
      console.error('Error al cargar recursos:', resError);
      this.ns.show('Error al cargar recursos del comercio.', 'error');
    } else {
      this.resources = resData || [];
    }

    // CARGAR BOOKINGS DEL DIA (Mock temporal hasta crear la vista completa)
    this.bookings = [];

    // CARGAR BLOQUEOS
    this.loadExceptions();
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

  changeView(view: 'day' | 'week' | 'month') {
    this.currentView = view;
  }

  getBookingsForSlow(resourceId: string, time: string) {
    return this.bookings.filter(b => b.resourceId === resourceId && b.time === time);
  }

  openBookingDetails(booking: any) {
    this.selectedBooking = booking;
  }

  closeDetails() {
    this.selectedBooking = null;
  }

  // --- Resource Management ---
  openResourceCreator(resource: any = null) {
    if (resource) {
      this.isEditingResource = true;
      this.activeResource = { ...resource };
    } else {
      this.isEditingResource = false;
      this.activeResource = {
        name: '',
        type: 'service',
        duration_minutes: 45,
        buffer_time_minutes: 15,
        capacity: 1,
        base_price: 0
      };
    }
    this.showResourceModal = true;
  }

  closeResourceCreator() {
    this.showResourceModal = false;
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
      is_active: true
    };

    if (!this.isEditingResource) {
      // Create
      const { error } = await supabase
        .from('reservable_resources')
        .insert([payload]);

      if (error) {
        this.ns.show('Error al crear recurso: ' + error.message, 'error');
      } else {
        this.ns.show('Recurso creado exitosamente', 'success');
        this.loadRealData();
      }
    } else {
      // Update
      const { error } = await supabase
        .from('reservable_resources')
        .update(payload)
        .eq('id', this.activeResource.id);

      if (error) {
        this.ns.show('Error al actualizar: ' + error.message, 'error');
      } else {
        this.ns.show('Recurso actualizado', 'success');
        this.loadRealData();
      }
    }

    this.closeResourceCreator();
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
  }

  closeBlockCreator() {
    this.showBlockModal = false;
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

  getStatusClass(status: string) {
    switch (status) {
      case 'confirmed': return 'bg-success';
      case 'pending': return 'bg-warning';
      case 'completed': return 'bg-primary';
      case 'no_show': return 'bg-danger';
      default: return 'bg-secondary';
    }
  }

  getStatusText(status: string) {
    switch (status) {
      case 'confirmed': return 'Confirmado 🟢';
      case 'pending': return 'Pendiente 🟡';
      case 'completed': return 'Completado 🔵';
      case 'no_show': return 'No asistió 🔴';
      default: return 'Bloqueado ⚫';
    }
  }

  navigateDate(change: number) {
    this.currentDate.setDate(this.currentDate.getDate() + change);
    this.currentDate = new Date(this.currentDate); // trigger cd
  }
}

