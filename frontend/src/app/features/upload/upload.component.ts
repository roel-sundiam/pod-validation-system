import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UploadService } from '../../core/services/upload.service';
import { DeliveryService } from '../../core/services/delivery.service';
import {
  UploadProgressDialogComponent,
  UploadProgressData,
} from '../../shared/components/upload-progress-dialog/upload-progress-dialog.component';
import { interval, Subscription } from 'rxjs';

interface UploadFile {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatIconModule,
    MatDialogModule,
  ],
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.scss'],
})
export class UploadComponent {
  files: UploadFile[] = [];
  clientIdentifier: string = '';
  existingDeliveryId: string = ''; // For appending to existing delivery
  isUploading = false;
  isDragging = false;
  private pollingSubscription?: Subscription;
  readonly MAX_FILES_FREE_TIER = 2; // Render free tier limit

  constructor(
    private uploadService: UploadService,
    private deliveryService: DeliveryService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles) {
      this.addFiles(Array.from(droppedFiles));
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
    }
  }

  addFiles(newFiles: File[]): void {
    const validTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream', // For CSV files without proper MIME type
    ];

    // Check if adding these files would exceed the limit
    const totalAfterAdding = this.files.length + newFiles.length;
    if (totalAfterAdding > this.MAX_FILES_FREE_TIER) {
      this.snackBar.open(
        `⚠️ Free tier limit: Maximum ${this.MAX_FILES_FREE_TIER} images per upload. Selected ${newFiles.length}, currently have ${this.files.length}.`,
        'Close',
        { duration: 5000, panelClass: ['warning-snackbar'] }
      );
      return;
    }

    newFiles.forEach((file) => {
      if (
        validTypes.includes(file.type) ||
        file.name.toLowerCase().endsWith('.csv') ||
        file.name.toLowerCase().endsWith('.xlsx') ||
        file.name.toLowerCase().endsWith('.xls')
      ) {
        this.files.push({
          file,
          status: 'pending',
          progress: 0,
        });
      } else {
        this.snackBar.open(`Skipped ${file.name}: Invalid file type`, 'Close', {
          duration: 3000,
        });
      }
    });
  }

  removeFile(index: number): void {
    this.files.splice(index, 1);
  }

  clearAll(): void {
    this.files = [];
  }

  async uploadFiles(): Promise<void> {
    if (this.files.length === 0) {
      this.snackBar.open('Please select files to upload', 'Close', {
        duration: 3000,
      });
      return;
    }

    this.isUploading = true;

    // Prepare dialog data
    const dialogData: UploadProgressData = {
      files: this.files.map((f) => ({
        name: f.file.name,
        size: f.file.size,
        status: 'uploading',
        progress: 0,
      })),
      stage: 'uploading',
      overallProgress: 0,
    };

    // Open progress dialog
    const dialogRef = this.dialog.open(UploadProgressDialogComponent, {
      width: '700px',
      disableClose: true,
      data: dialogData,
    });

    try {
      const filesToUpload = this.files.map((f) => f.file);

      // Mark all as uploading
      this.files.forEach((f) => {
        f.status = 'uploading';
        f.progress = 50;
      });

      const response = await this.uploadService
        .uploadFiles(
          filesToUpload,
          this.clientIdentifier || undefined,
          this.existingDeliveryId || undefined
        )
        .toPromise();

      // Update to 30% after upload completes
      dialogData.overallProgress = 30;

      // Update dialog to processing stage
      dialogData.stage = 'processing';
      dialogData.deliveryId = response?.deliveryId;
      dialogData.files.forEach((f) => (f.status = 'processing'));

      // Set to 40% when processing starts
      dialogData.overallProgress = 40;

      // Mark all as success
      this.files.forEach((f) => {
        f.status = 'success';
        f.progress = 100;
      });

      // Poll for delivery completion
      if (response?.deliveryId) {
        await this.pollDeliveryStatus(response.deliveryId, dialogData);
      } else {
        // If no delivery ID, just mark as completed
        dialogData.stage = 'completed';
        dialogData.files.forEach((f) => (f.status = 'completed'));
      }
    } catch (error: any) {
      // Mark all as error
      this.files.forEach((f) => {
        f.status = 'error';
        f.error = error.message || 'Upload failed';
      });

      dialogData.stage = 'failed';
      dialogData.files.forEach((f) => (f.status = 'failed'));
      dialogData.overallProgress = 0;

      this.snackBar.open(`Upload failed: ${error.message}`, 'Close', {
        duration: 5000,
      });
    } finally {
      this.isUploading = false;
    }

    // Handle dialog close
    dialogRef.afterClosed().subscribe((result) => {
      if (result?.action === 'viewDashboard') {
        this.router.navigate(['/dashboard']);
      } else if (result?.action === 'uploadMore') {
        // Save delivery ID for appending more images
        if (dialogData.deliveryId && !this.existingDeliveryId) {
          this.existingDeliveryId = dialogData.deliveryId;
          this.snackBar
            .open(
              `💡 Upload 2 more images to add to this delivery (ID: ${this.existingDeliveryId.substring(
                0,
                8
              )}...)`,
              'Clear',
              {
                duration: 8000,
              }
            )
            .onAction()
            .subscribe(() => {
              this.existingDeliveryId = '';
            });
        }
        this.files = [];
        // Keep clientIdentifier and existingDeliveryId for next batch
      }
    });
  }

  private async pollDeliveryStatus(
    deliveryId: string,
    dialogData: UploadProgressData
  ): Promise<void> {
    return new Promise((resolve) => {
      let pollCount = 0;
      const maxPolls = 60; // Poll for max 3 minutes (60 * 3 seconds)

      this.pollingSubscription = interval(3000).subscribe(async () => {
        pollCount++;

        // Increment progress gradually from 40% to 90% during processing
        const progressIncrement = Math.min(90, 40 + pollCount * 2);
        dialogData.overallProgress = progressIncrement;

        try {
          const delivery = await this.deliveryService
            .getDeliveryById(deliveryId)
            .toPromise();

          if (delivery?.status === 'COMPLETED') {
            // Get validation results - service already extracts data from APIResponse
            const validationResponse = await this.deliveryService
              .getDeliveryValidation(deliveryId)
              .toPromise();

            dialogData.stage = 'completed';
            dialogData.files.forEach((f) => (f.status = 'completed'));
            // Service already extracts data, so validationResponse.validation is the correct path
            dialogData.validationResult = validationResponse?.validation;
            dialogData.deliveryId = deliveryId;
            dialogData.overallProgress = 100;

            this.pollingSubscription?.unsubscribe();
            resolve();
          } else if (delivery?.status === 'FAILED') {
            dialogData.stage = 'failed';
            dialogData.files.forEach((f) => (f.status = 'failed'));
            dialogData.overallProgress = 0;

            this.pollingSubscription?.unsubscribe();
            resolve();
          } else if (pollCount >= maxPolls) {
            // Timeout - assume completed
            dialogData.stage = 'completed';
            dialogData.files.forEach((f) => (f.status = 'completed'));
            dialogData.overallProgress = 100;

            this.pollingSubscription?.unsubscribe();
            resolve();
          }
        } catch (error) {
          console.error('Error polling delivery status:', error);
          if (pollCount >= maxPolls) {
            this.pollingSubscription?.unsubscribe();
            resolve();
          }
        }
      });
    });
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'pending':
        return 'description';
      case 'uploading':
        return 'cloud_upload';
      case 'success':
        return 'check_circle';
      case 'error':
        return 'error';
      default:
        return 'description';
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
