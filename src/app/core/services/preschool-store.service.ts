import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

export interface PreSchoolStoreItem {
  id: number;
  name: string;
  classId: number | null;
  className: string;
  sortOrder: number;
  isActive: boolean;
  /** Everything ever received: the class's capacity for this item. */
  received: number;
  given: number;
  inStock: number;
  students: number;
  studentsWaiting: number;
  /** The usual price paid per piece (to My Chhota School). */
  unitCost?: number | null;
  /** The Fee Receipt line parents pay this item on. */
  chargeHead?: string | null;
  /** Everything spent buying it. */
  spent?: number;
}

export interface PreSchoolStoreMovement {
  id: number;
  itemId: number;
  itemName: string;
  kind: 'In' | 'Out';
  quantity: number;
  studentId: number | null;
  studentName: string | null;
  admissionCode: string | null;
  onDate: string;
  note: string | null;
  createdBy: string | null;
  unitCost?: number | null;
  supplier?: string | null;
}

export interface PreSchoolSupplierPayment {
  id: number;
  supplier: string;
  paidOn: string;
  amount: number;
  mode: 'Cash' | 'Bank' | 'UPI' | 'Cheque';
  reference?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

/** The account with My Chhota School: stock bought, paid in bulk, and still owed. */
export interface PreSchoolSupplierAccount {
  supplier: string;
  bought: number;
  paid: number;
  balance: number;
  payments: PreSchoolSupplierPayment[];
}

export interface PreSchoolSupplierPaymentSave {
  paidOn: string | null;
  amount: number;
  mode: PreSchoolSupplierPayment['mode'];
  reference: string | null;
  note: string | null;
}

export interface PreSchoolStore { items: PreSchoolStoreItem[]; recent: PreSchoolStoreMovement[]; account?: PreSchoolSupplierAccount; }

export interface PreSchoolStudentStoreLine {
  itemId: number;
  itemName: string;
  inStock: number;
  issueId: number | null;
  givenOn: string | null;
  givenBy: string | null;
}

export interface PreSchoolStoreItemSave {
  name: string; classId: number | null; sortOrder: number; isActive: boolean;
  unitCost: number | null; chargeHead: string | null;
}

/** The PreSchool store: tuition books, bags and the like, class by class. */
@Injectable({ providedIn: 'root' })
export class PreSchoolStoreService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/preschool`;

  store(): Observable<PreSchoolStore> {
    return this.http.get<ApiResponse<PreSchoolStore>>(`${this.base}/store`).pipe(map(r => r.data));
  }

  saveItem(id: number | null, body: PreSchoolStoreItemSave): Observable<PreSchoolStoreItem> {
    const call = id === null
      ? this.http.post<ApiResponse<PreSchoolStoreItem>>(`${this.base}/store/items`, body)
      : this.http.put<ApiResponse<PreSchoolStoreItem>>(`${this.base}/store/items/${id}`, body);
    return call.pipe(map(r => r.data));
  }

  /** Stock bought: how many, the price paid per piece, and from whom (My Chhota School when left out). */
  stockIn(itemId: number, quantity: number, onDate: string | null, note: string | null,
          unitCost: number | null = null, supplier: string | null = null): Observable<PreSchoolStoreItem> {
    return this.http.post<ApiResponse<PreSchoolStoreItem>>(`${this.base}/store/items/${itemId}/stock`,
      { quantity, onDate, note, unitCost, supplier }).pipe(map(r => r.data));
  }

  /** A bulk payment to My Chhota School. */
  addSupplierPayment(body: PreSchoolSupplierPaymentSave): Observable<PreSchoolSupplierAccount> {
    return this.http.post<ApiResponse<PreSchoolSupplierAccount>>(`${this.base}/store/supplier-payments`, body).pipe(map(r => r.data));
  }

  removeSupplierPayment(id: number): Observable<PreSchoolSupplierAccount> {
    return this.http.delete<ApiResponse<PreSchoolSupplierAccount>>(`${this.base}/store/supplier-payments/${id}`).pipe(map(r => r.data));
  }

  removeMovement(id: number): Observable<boolean> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/store/movements/${id}`).pipe(map(r => r.data));
  }

  forStudent(studentId: number): Observable<PreSchoolStudentStoreLine[]> {
    return this.http.get<ApiResponse<PreSchoolStudentStoreLine[]>>(`${this.base}/students/${studentId}/store`).pipe(map(r => r.data));
  }

  give(studentId: number, itemId: number): Observable<PreSchoolStudentStoreLine[]> {
    return this.http.post<ApiResponse<PreSchoolStudentStoreLine[]>>(`${this.base}/students/${studentId}/store/${itemId}`, null)
      .pipe(map(r => r.data));
  }
}
