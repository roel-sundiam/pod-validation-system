import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { APIResponse, UploadResponse, JobStatus } from '../models/pod.model';

@Injectable({
  providedIn: 'root',
})
export class UploadService {
  constructor(private api: ApiService) {}

  uploadFiles(
    files: File[],
    clientIdentifier?: string,
    existingDeliveryId?: string,
    expectedData?: any
  ): Observable<UploadResponse> {
    const formData = new FormData();

    // Append files
    files.forEach((file) => {
      formData.append('files', file, file.name);
    });

    // Append optional data
    if (clientIdentifier) {
      formData.append('clientIdentifier', clientIdentifier);
    }

    if (existingDeliveryId) {
      formData.append('deliveryId', existingDeliveryId);
    }

    if (expectedData) {
      formData.append('expectedData', JSON.stringify(expectedData));
    }

    // Use new delivery endpoint for multi-document validation
    return this.api
      .upload<APIResponse<UploadResponse>>('deliveries/upload', formData)
      .pipe(
        map((response) => {
          if (!response.success || !response.data) {
            throw new Error(response.error || 'Upload failed');
          }
          return response.data;
        })
      );
  }

  getJobStatus(jobId: string): Observable<JobStatus> {
    return this.api.get<APIResponse<JobStatus>>(`pods/${jobId}/status`).pipe(
      map((response) => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to get job status');
        }
        return response.data;
      })
    );
  }
}
