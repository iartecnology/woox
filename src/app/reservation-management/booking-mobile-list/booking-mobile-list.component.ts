import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getStatusClass, getStatusText, getServiceColor } from '../reservation.utils';

@Component({
  selector: 'app-booking-mobile-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './booking-mobile-list.component.html',
  styleUrls: ['./booking-mobile-list.component.css']
})
export class BookingMobileList {
  @Input() bookings: any[] = [];
  @Input() resources: any[] = [];
  
  @Output() onOpenDetails = new EventEmitter<any>();

  getStatusText = getStatusText;
  getStatusClass = getStatusClass;
  getServiceColor = getServiceColor;

  getResourceName(id: string): string {
    const res = this.resources.find(r => r.id === id);
    return res ? res.name : 'Recurso';
  }

  selectBooking(booking: any) {
    this.onOpenDetails.emit(booking);
  }
}
