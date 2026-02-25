import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-reservation-management',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './reservation-management.html',
  styleUrls: ['./reservation-management.css'],
})
export class ReservationManagement implements OnInit {
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

  resources = [
    { id: '1', name: 'Dr. Pérez', type: 'professional' },
    { id: '2', name: 'Dra. Gómez', type: 'professional' },
    { id: '3', name: 'Dr. Ruiz', type: 'professional' }
  ];

  timeSlots = [
    '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00'
  ];

  bookings = [
    { id: 'b1', resourceId: '1', customerName: 'Juan Manuel', time: '09:00', durationMinutes: 45, status: 'confirmed', service: 'Consulta General' },
    { id: 'b2', resourceId: '2', customerName: 'María Clara', time: '11:00', durationMinutes: 60, status: 'pending', service: 'Odontología' },
    { id: 'b3', resourceId: '1', customerName: 'Carlos Luis', time: '14:00', durationMinutes: 30, status: 'completed', service: 'Limpieza' },
    { id: 'b4', resourceId: '3', customerName: 'Ana Sofía', time: '15:00', durationMinutes: 45, status: 'no_show', service: 'Revisión' }
  ];

  selectedBooking: any = null;

  ngOnInit() {
    // Load from supabase later
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

