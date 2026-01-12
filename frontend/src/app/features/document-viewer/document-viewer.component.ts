import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatListModule } from '@angular/material/list';
import { ValidationService } from '../../core/services/validation.service';
import { DeliveryService, DeliveryValidationResponse } from '../../core/services/delivery.service';
import { PODDocument, DeliveryValidationChecklist } from '../../core/models/pod.model';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { PeculiarityListComponent } from '../../shared/components/peculiarity-list/peculiarity-list.component';
import { ValidationChecklistComponent } from '../../shared/components/validation-checklist/validation-checklist.component';

@Component({
  selector: 'app-document-viewer',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatExpansionModule,
    MatListModule,
    StatusBadgeComponent,
    PeculiarityListComponent,
    ValidationChecklistComponent,
  ],
  templateUrl: './document-viewer.component.html',
  styleUrls: ['./document-viewer.component.scss']
})
export class DocumentViewerComponent implements OnInit {
  pod: PODDocument | null = null;
  deliveryValidation: DeliveryValidationResponse | null = null;
  isLoading = true;
  isReprocessing = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private validationService: ValidationService,
    private deliveryService: DeliveryService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadPOD(id);
    } else {
      this.snackBar.open('Invalid POD ID', 'Close', { duration: 3000 });
      this.router.navigate(['/dashboard']);
    }
  }

  loadPOD(id: string): void {
    this.isLoading = true;

    this.validationService.getPODById(id).subscribe({
      next: (pod) => {
        this.pod = pod;
        this.isLoading = false;

        // If POD belongs to a delivery, fetch delivery validation
        if (pod.deliveryId) {
          this.loadDeliveryValidation(pod.deliveryId);
        }
      },
      error: (error) => {
        console.error('Error loading POD:', error);
        this.snackBar.open(`Error loading POD: ${error.message}`, 'Close', {
          duration: 5000
        });
        this.isLoading = false;
        this.router.navigate(['/dashboard']);
      }
    });
  }

  loadDeliveryValidation(deliveryId: string): void {
    this.deliveryService.getDeliveryValidation(deliveryId).subscribe({
      next: (validation) => {
        this.deliveryValidation = validation;
      },
      error: (error) => {
        console.error('Error loading delivery validation:', error);
        // Don't show error to user - delivery validation is optional
      }
    });
  }

  reprocess(): void {
    if (!this.pod) return;

    this.isReprocessing = true;

    this.validationService.reprocessPOD(this.pod._id, this.pod.clientIdentifier).subscribe({
      next: (response) => {
        this.snackBar.open('POD reprocessing started', 'Close', { duration: 3000 });
        this.isReprocessing = false;
        // Reload the POD after a short delay
        setTimeout(() => {
          this.loadPOD(this.pod!._id);
        }, 2000);
      },
      error: (error) => {
        console.error('Error reprocessing POD:', error);
        this.snackBar.open(`Error: ${error.message}`, 'Close', { duration: 5000 });
        this.isReprocessing = false;
      }
    });
  }

  downloadFile(): void {
    if (!this.pod) return;

    this.validationService.downloadFile(this.pod._id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = this.pod!.fileMetadata.originalName;
        link.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('File downloaded', 'Close', { duration: 2000 });
      },
      error: (error) => {
        console.error('Error downloading file:', error);
        this.snackBar.open(`Error: ${error.message}`, 'Close', { duration: 5000 });
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleString();
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  getCheckIcon(value: boolean): string {
    return value ? 'check_circle' : 'cancel';
  }

  getCheckClass(value: boolean): string {
    return value ? 'check-success' : 'check-fail';
  }
}
