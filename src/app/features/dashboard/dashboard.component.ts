import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { DashboardSummary } from '../../core/models/dashboard.model';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';

interface StatCard {
  label: string;
  value: string;
  icon: string;
  tone: 'brand' | 'accent' | 'positive' | 'negative' | 'neutral';
  caption?: string;
}

/**
 * Home Dashboard — replaces the landing view the legacy app rendered from
 * `Views/About/Index.cshtml`. Everything comes from GET /api/v1/dashboard/summary
 * in one round trip.
 */
@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, CardModule, ChartModule, TableModule, TagModule, ButtonModule, SkeletonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly dashboard = inject(DashboardService);
  private readonly auth = inject(AuthService);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly userName = computed(() => this.auth.user()?.name ?? '');

  /**
   * The migrated ledger stops before the current month, so an all-zero "this month"
   * is the truth rather than a failure. Say so instead of showing a blank panel.
   */
  readonly noActivityThisMonth = computed(() => {
    const finance = this.summary()?.finance;
    if (!finance) {
      return false;
    }

    return finance.totalIncomeThisMonth === 0 && finance.totalCostThisMonth === 0;
  });

  readonly stats = computed<StatCard[]>(() => {
    const data = this.summary();
    if (!data) {
      return [];
    }

    const { counts, finance } = data;

    return [
      {
        label: 'Active students',
        value: counts.activeStudents.toString(),
        icon: 'pi pi-users',
        tone: 'brand',
        caption: `${counts.inactiveStudents} inactive · ${counts.completedStudents} completed`
      },
      {
        label: 'Income this month',
        value: this.money(finance.totalIncomeThisMonth),
        icon: 'pi pi-wallet',
        tone: 'accent',
        caption:
          `${this.money(finance.feesCollectedThisMonth)} fees` +
          (finance.lateFinesThisMonth > 0 ? ` · ${this.money(finance.lateFinesThisMonth)} fines` : '')
      },
      {
        label: 'Cost this month',
        value: this.money(finance.totalCostThisMonth),
        icon: 'pi pi-minus-circle',
        tone: 'neutral',
        caption:
          `${this.money(finance.teacherPayoutThisMonth)} to teachers · ` +
          `${this.money(finance.expensesThisMonth)} expenses`
      },
      {
        label: 'Net this month',
        value: this.money(finance.netThisMonth),
        icon: finance.netThisMonth >= 0 ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right',
        tone: finance.netThisMonth >= 0 ? 'positive' : 'negative',
        caption:
          finance.outstandingDues > 0
            ? `${this.money(finance.outstandingDues)} due from ${finance.studentsInArrears} student(s)`
            : 'No outstanding dues'
      }
    ];
  });

  /** Income vs expense over the last 12 months. */
  readonly trendChart = computed(() => {
    const data = this.summary();
    if (!data) {
      return null;
    }

    return {
      labels: data.trend.map(point => `${point.label} ${String(point.year).slice(2)}`),
      datasets: [
        {
          label: 'Income',
          data: data.trend.map(point => point.income),
          borderColor: '#6d28d9',
          backgroundColor: 'rgba(109, 40, 217, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3
        },
        {
          label: 'Teacher payout',
          data: data.trend.map(point => point.teacherPayout),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.10)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3
        },
        {
          label: 'Expenses',
          data: data.trend.map(point => point.expense),
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.10)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3
        }
      ]
    };
  });

  readonly trendOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { usePointStyle: true, boxWidth: 8, padding: 16 } },
      tooltip: { mode: 'index' as const, intersect: false }
    },
    interaction: { mode: 'index' as const, intersect: false },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { maxTicksLimit: 6 }, grid: { color: 'rgba(0,0,0,0.05)' } }
    }
  };

  /** Active students by course. */
  readonly enrolmentChart = computed(() => {
    const data = this.summary();
    if (!data) {
      return null;
    }

    const enrolled = data.courseEnrolment.filter(course => course.studentCount > 0);

    return {
      labels: enrolled.map(course => course.courseName),
      datasets: [
        {
          data: enrolled.map(course => course.studentCount),
          backgroundColor: ['#6d28d9', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6'],
          borderWidth: 0
        }
      ]
    };
  });

  readonly enrolmentOptions = {
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { position: 'bottom' as const, labels: { usePointStyle: true, boxWidth: 8, padding: 14 } }
    }
  };

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);

    this.dashboard.getSummary().subscribe({
      next: data => {
        this.summary.set(data);
        this.loading.set(false);
      },
      error: () => {
        // The error interceptor already raised a toast; just show the retry state.
        this.loading.set(false);
        this.failed.set(true);
      }
    });
  }

  money(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value ?? 0);
  }
}
