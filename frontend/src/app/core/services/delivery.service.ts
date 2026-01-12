import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { APIResponse, DeliveryValidationChecklist } from '../models/pod.model';

export interface DeliveryValidationResponse {
  deliveryId: string;
  validation: {
    status: 'PASS' | 'REVIEW' | 'FAIL';
    summary: string;
    timestamp: Date;
    documentCompleteness: any;
    crossDocumentChecks: any[];
    peculiarities: any[];
    checklist?: DeliveryValidationChecklist;
  };
  documents: any[];
}

export interface Delivery {
  _id: string;
  deliveryReference: string;
  clientIdentifier?: string;
  uploadedAt: Date;
  status: 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  documents: any[];
  deliveryValidation?: any;
}

export interface DeliveryListParams {
  clientIdentifier?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface DeliveryListResponse {
  deliveries: Delivery[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class DeliveryService {
  constructor(private api: ApiService) {}

  getDeliveryValidation(deliveryId: string): Observable<DeliveryValidationResponse> {
    return this.api.get<APIResponse<DeliveryValidationResponse>>(`deliveries/${deliveryId}/validation`).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to get delivery validation');
        }
        return response.data;
      })
    );
  }

  getDeliveryById(deliveryId: string): Observable<any> {
    return this.api.get<APIResponse<any>>(`deliveries/${deliveryId}`).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to get delivery');
        }
        return response.data;
      })
    );
  }

  listDeliveries(params: DeliveryListParams = {}): Observable<DeliveryListResponse> {
    const queryParams: any = {};

    if (params.clientIdentifier) queryParams.clientIdentifier = params.clientIdentifier;
    if (params.status) queryParams.status = params.status;
    if (params.dateFrom) queryParams.dateFrom = params.dateFrom;
    if (params.dateTo) queryParams.dateTo = params.dateTo;
    if (params.page) queryParams.page = params.page.toString();
    if (params.limit) queryParams.limit = params.limit.toString();

    const queryString = new URLSearchParams(queryParams).toString();
    const url = queryString ? `deliveries?${queryString}` : 'deliveries';

    return this.api.get<APIResponse<DeliveryListResponse>>(url).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to list deliveries');
        }
        return response.data;
      })
    );
  }
}
