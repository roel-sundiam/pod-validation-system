import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  ClientValidationConfig,
  ClientConfigResponse,
  ClientListResponse,
  ValidationPreview,
} from '../models/client-config.model';

@Injectable({
  providedIn: 'root',
})
export class ClientConfigService {
  private apiUrl = `${environment.apiUrl}/admin/clients`;

  constructor(private http: HttpClient) {}

  /**
   * Get all active client configurations
   */
  getAllClients(): Observable<ClientListResponse> {
    return this.http.get<ClientListResponse>(this.apiUrl).pipe(
      tap((response) => console.log('Fetched clients:', response.count)),
      catchError(this.handleError)
    );
  }

  /**
   * Get a specific client configuration
   */
  getClientConfig(clientId: string): Observable<ClientConfigResponse> {
    return this.http
      .get<ClientConfigResponse>(`${this.apiUrl}/${clientId}`)
      .pipe(
        tap((response) => console.log('Fetched config for:', clientId)),
        catchError(this.handleError)
      );
  }

  /**
   * Create a new client configuration
   */
  createClientConfig(
    config: Partial<ClientValidationConfig>
  ): Observable<ClientConfigResponse> {
    return this.http.post<ClientConfigResponse>(this.apiUrl, config).pipe(
      tap((response) => console.log('Created config:', response.data.clientId)),
      catchError(this.handleError)
    );
  }

  /**
   * Update an existing client configuration
   */
  updateClientConfig(
    clientId: string,
    config: Partial<ClientValidationConfig>
  ): Observable<ClientConfigResponse> {
    return this.http
      .put<ClientConfigResponse>(`${this.apiUrl}/${clientId}`, config)
      .pipe(
        tap((response) => console.log('Updated config:', clientId)),
        catchError(this.handleError)
      );
  }

  /**
   * Deactivate a client configuration
   */
  deactivateClient(
    clientId: string,
    deactivatedBy?: string
  ): Observable<{ success: boolean; message: string }> {
    return this.http
      .delete<{ success: boolean; message: string }>(
        `${this.apiUrl}/${clientId}`,
        {
          body: { deactivatedBy },
        }
      )
      .pipe(
        tap(() => console.log('Deactivated client:', clientId)),
        catchError(this.handleError)
      );
  }

  /**
   * Clear cache for a specific client or all clients
   */
  clearCache(
    clientId?: string
  ): Observable<{ success: boolean; message: string }> {
    return this.http
      .post<{ success: boolean; message: string }>(
        `${this.apiUrl}/cache/clear`,
        { clientId }
      )
      .pipe(
        tap(() => console.log('Cache cleared for:', clientId || 'ALL')),
        catchError(this.handleError)
      );
  }

  /**
   * Preview validation checks for a client
   */
  previewValidationChecks(
    clientId: string
  ): Observable<{ success: boolean; data: ValidationPreview }> {
    return this.http
      .get<{ success: boolean; data: ValidationPreview }>(
        `${this.apiUrl}/${clientId}/preview`
      )
      .pipe(
        tap((response) => console.log('Preview for:', clientId)),
        catchError(this.handleError)
      );
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = 'An error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = error.error?.error || error.message || errorMessage;
    }

    console.error('ClientConfigService Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
