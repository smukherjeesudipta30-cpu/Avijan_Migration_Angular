import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { TeacherExamScheduleItem } from '../../core/models/teacher-exam.model';
import { TeacherExamService } from '../../core/services/teacher-exam.service';

/**
 * The teacher's own side of the competency exam portal: what's coming up,
 * what's ready to take, and past results.
 */
@Component({
  selector: 'app-my-teacher-exam',
  imports: [CommonModule, ButtonModule, DialogModule, TableModule, TagModule],
  templateUrl: './my-teacher-exam.component.html',
  styleUrl: './my-teacher-exam.component.scss'
})
export class MyTeacherExamComponent implements OnInit {
  private readonly exams = inject(TeacherExamService);
  private readonly router = inject(Router);

  readonly rows = signal<TeacherExamScheduleItem[]>([]);
  readonly loading = signal(false);

  readonly guideVisible = signal(false);
  readonly guideFor = signal<TeacherExamScheduleItem | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.exams.my().subscribe({
      next: rows => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  pct(value: number | undefined | null): string {
    return `${(value ?? 0).toFixed(2)}%`;
  }

  viewGuide(row: TeacherExamScheduleItem): void {
    this.guideFor.set(row);
    this.guideVisible.set(true);
  }

  start(row: TeacherExamScheduleItem): void {
    this.router.navigate(['/my-teacher-exam', row.id, 'sit']);
  }
}
