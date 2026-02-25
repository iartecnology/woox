import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BookingWidget } from './booking-widget';

describe('BookingWidget', () => {
  let component: BookingWidget;
  let fixture: ComponentFixture<BookingWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingWidget]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BookingWidget);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
