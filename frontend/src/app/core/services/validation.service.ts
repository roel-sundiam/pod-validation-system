import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';
import {
  APIResponse,
  PODDocument,
  PODListResponse,
  StatisticsSummary
} from '../models/pod.model';

export interface PODListParams {
  status?: 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  clientIdentifier?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ValidationService {
  constructor(private api: ApiService) {}

  listPODs(params?: PODListParams): Observable<PODListResponse> {
    return this.api.get<APIResponse<PODListResponse>>('pods', params).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to list PODs');
        }
        return response.data;
      })
    );
  }

  getPODById(id: string): Observable<PODDocument> {
    return this.api.get<APIResponse<PODDocument>>(`pods/${id}`).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to get POD');
        }
        return response.data;
      })
    );
  }

  downloadFile(id: string): Observable<Blob> {
    return this.api.downloadFile(`pods/${id}/file`);
  }

  reprocessPOD(id: string, clientIdentifier?: string): Observable<{ jobId: string }> {
    return this.api.post<APIResponse<{ jobId: string }>>(`pods/${id}/reprocess`, {
      clientIdentifier
    }).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to reprocess POD');
        }
        return response.data;
      })
    );
  }

  getStatistics(params?: { status?: string }): Observable<StatisticsSummary> {
    return this.api.get<APIResponse<StatisticsSummary>>('statistics/summary', params).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to get statistics');
        }
        return response.data;
      })
    );
  }
}
