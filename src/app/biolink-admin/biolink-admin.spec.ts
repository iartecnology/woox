import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BiolinkAdmin } from './biolink-admin';

describe('BiolinkAdmin', () => {
  let component: BiolinkAdmin;
  let fixture: ComponentFixture<BiolinkAdmin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BiolinkAdmin]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BiolinkAdmin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
