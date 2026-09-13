import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BiolinkAdminComponent } from './biolink-admin';

describe('BiolinkAdminComponent', () => {
  let component: BiolinkAdminComponent;
  let fixture: ComponentFixture<BiolinkAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BiolinkAdminComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BiolinkAdminComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
