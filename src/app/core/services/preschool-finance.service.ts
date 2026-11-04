import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  PreSchoolAlerts, PreSchoolExpense, PreSchoolExpenseSave, PreSchoolIncomeReport, PreSchoolSalaryPay, PreSchoolSalaryPayment,
  PreSchoolSalarySheet, PreSchoolStaff, PreSchoolStaffSave
} from '../models/preschool-finance.model';

/** Avijan PreSchool staff and salaries, expenses and income report — the PreSchool admin's side. */
@Injectable({ providedIn: 'root' })
export class PreSchoolFinanceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/preschool`;

  staff(): Observable<PreSchoolStaff[]> {
    return this.http.get<ApiResponse<PreSchoolStaff[]>>(`${this.base}/staff`).pipe(map(r => r.data));
  }

  saveStaff(id: number | null, body: PreSchoolStaffSave): Observable<PreSchoolStaff> {
    const call = id === null
      ? this.http.post<ApiResponse<PreSchoolStaff>>(`${this.base}/staff`, body)
      : this.http.put<ApiResponse<PreSchoolStaff>>(`${this.base}/staff/${id}`, body);
    return call.pipe(map(r => r.data));
  }

  salarySheet(month: string): Observable<PreSchoolSalarySheet> {
    return this.http.get<ApiResponse<PreSchoolSalarySheet>>(`${this.base}/salaries`, { params: { month } }).pipe(map(r => r.data));
  }

  paySalary(body: PreSchoolSalaryPay): Observable<PreSchoolSalaryPayment> {
    return this.http.post<ApiResponse<PreSchoolSalaryPayment>>(`${this.base}/salaries`, body).pipe(map(r => r.data));
  }

  salaryPayment(id: number): Observable<PreSchoolSalaryPayment> {
    return this.http.get<ApiResponse<PreSchoolSalaryPayment>>(`${this.base}/salaries/${id}`).pipe(map(r => r.data));
  }

  deleteSalaryPayment(id: number): Observable<boolean> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/salaries/${id}`).pipe(map(r => r.data));
  }

  expenses(from: string, to: string): Observable<PreSchoolExpense[]> {
    return this.http.get<ApiResponse<PreSchoolExpense[]>>(`${this.base}/expenses`, { params: { from, to } }).pipe(map(r => r.data));
  }

  saveExpense(id: number | null, body: PreSchoolExpenseSave): Observable<PreSchoolExpense> {
    const call = id === null
      ? this.http.post<ApiResponse<PreSchoolExpense>>(`${this.base}/expenses`, body)
      : this.http.put<ApiResponse<PreSchoolExpense>>(`${this.base}/expenses/${id}`, body);
    return call.pipe(map(r => r.data));
  }

  deleteExpense(id: number): Observable<boolean> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/expenses/${id}`).pipe(map(r => r.data));
  }

  alerts(): Observable<PreSchoolAlerts> {
    return this.http.get<ApiResponse<PreSchoolAlerts>>(`${this.base}/alerts`).pipe(map(r => r.data));
  }

  markAlertRead(id: number): Observable<boolean> {
    return this.http.patch<ApiResponse<boolean>>(`${this.base}/alerts/${id}/read`, null).pipe(map(r => r.data));
  }

  markAllAlertsRead(): Observable<number> {
    return this.http.patch<ApiResponse<number>>(`${this.base}/alerts/read-all`, null).pipe(map(r => r.data));
  }

  /** The signed-in PreSchool staff member's own salary slips. */
  myPayslips(): Observable<PreSchoolSalaryPayment[]> {
    return this.http.get<ApiResponse<PreSchoolSalaryPayment[]>>(`${this.base}/my-payslips`).pipe(map(r => r.data));
  }

  income(year: number): Observable<PreSchoolIncomeReport> {
    return this.http.get<ApiResponse<PreSchoolIncomeReport>>(`${this.base}/reports/income`, { params: { year } }).pipe(map(r => r.data));
  }
}
