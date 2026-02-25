import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReservationManagement } from './reservation-management';

describe('ReservationManagement', () => {
  let component: ReservationManagement;
  let fixture: ComponentFixture<ReservationManagement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationManagement]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReservationManagement);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
