import { Component } from '@angular/core';

import { OrgChartComponent } from './org-chart.component';

/** The chart on a page of its own, reachable from the menu by anybody signed in. */
@Component({
  selector: 'app-org-chart-page',
  standalone: true,
  imports: [OrgChartComponent],
  template: `
    <div class="org-page">
      <app-org-chart heading="Institute Hierarchy" />
    </div>
  `,
  styles: [`
    .org-page {
      padding: 1rem;
    }
  `]
})
export class OrgChartPageComponent {}
