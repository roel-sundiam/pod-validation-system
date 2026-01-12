import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';

export interface UploadProgressData {
  files: Array<{
    name: string;
    size: number;
    status: 'uploading' | 'processing' | 'completed' | 'failed';
    progress: number;
  }>;
  deliveryId?: string;
  validationResult?: any;
  stage: 'uploading' | 'processing' | 'completed' | 'failed';
  overallProgress: number; // 0-100 percentage
}

@Component({
  selector: 'app-upload-progress-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatButtonModule,
  ],
  templateUrl: './upload-progress-dialog.component.html',
  styleUrls: ['./upload-progress-dialog.component.scss'],
})
export class UploadProgressDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<UploadProgressDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UploadProgressData
  ) {}

  closeDialog(): void {
    this.dialogRef.close();
  }

  viewDashboard(): void {
    this.dialogRef.close({ action: 'viewDashboard' });
  }

  uploadMore(): void {
    this.dialogRef.close({ action: 'uploadMore' });
  }

  getStageIcon(): string {
    switch (this.data.stage) {
      case 'uploading':
        return 'cloud_upload';
      case 'processing':
        return 'settings';
      case 'completed':
        return 'check_circle';
      case 'failed':
        return 'error';
      default:
        return 'cloud_upload';
    }
  }

  getStageTitle(): string {
    switch (this.data.stage) {
      case 'uploading':
        return 'Uploading Files';
      case 'processing':
        return 'Processing Documents';
      case 'completed':
        return 'Validation Complete';
      case 'failed':
        return 'Upload Failed';
      default:
        return 'Uploading';
    }
  }

  getStageMessage(): string {
    switch (this.data.stage) {
      case 'uploading':
        return 'Your files are being uploaded to the server...';
      case 'processing':
        return 'Running OCR, document classification, and validation checks...';
      case 'completed':
        return 'All documents have been processed and validated successfully!';
      case 'failed':
        return 'An error occurred during upload or processing.';
      default:
        return '';
    }
  }

  getValidationStatusClass(): string {
    if (!this.data.validationResult?.status) return '';
    const status = this.data.validationResult.status.toLowerCase();
    return `status-${status}`;
  }

  getValidationStatusIcon(): string {
    if (!this.data.validationResult?.status) return 'help';
    const status = this.data.validationResult.status.toLowerCase();
    switch (status) {
      case 'pass':
        return 'check_circle';
      case 'fail':
        return 'cancel';
      case 'review':
        return 'warning';
      default:
        return 'help';
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  formatCheckDetails(details: any): string {
    if (!details) return '';
    if (typeof details === 'string') return details;
    if (typeof details === 'number') return details.toString();

    try {
      // Handle common detail structures
      if (
        details.invoiceTotal !== undefined &&
        details.rarTotal !== undefined
      ) {
        return `Invoice: ${details.invoiceTotal}, RAR: ${details.rarTotal}`;
      }
      if (details.invoicePO !== undefined && details.rarPO !== undefined) {
        return `Invoice PO: ${details.invoicePO || 'N/A'}, RAR PO: ${
          details.rarPO || 'N/A'
        }`;
      }

      // Handle discrepancy details with samples array
      if (details.discrepancyCount !== undefined && details.samples) {
        const samplesText = Array.isArray(details.samples)
          ? details.samples
              .map(
                (d: any) =>
                  `${d.itemCode || 'Unknown'}: Inv=${d.invoiceQty ?? 0}, RAR=${
                    d.rarQty ?? 0
                  }`
              )
              .join('; ')
          : String(details.samples);

        const remaining =
          details.discrepancyCount -
          (Array.isArray(details.samples) ? details.samples.length : 0);
        const moreText = remaining > 0 ? ` +${remaining} more` : '';

        return `${details.discrepancyCount} items - ${samplesText}${moreText}`;
      }

      if (details.discrepancyCount !== undefined) {
        return `${details.discrepancyCount} discrepancies found`;
      }

      // Handle arrays
      if (Array.isArray(details)) {
        if (details.length === 0) return '(empty)';
        if (details.length <= 3) {
          return details
            .map((item) =>
              typeof item === 'object' ? JSON.stringify(item) : String(item)
            )
            .join(', ');
        }
        return `${details.length} items`;
      }

      // Fallback: convert to readable string
      const keys = Object.keys(details);
      if (keys.length === 0) return '(empty)';
      if (keys.length <= 3) {
        return keys
          .map((k) => {
            const val = details[k];
            if (Array.isArray(val)) {
              return `${k}: [${val.length} items]`;
            }
            if (typeof val === 'object' && val !== null) {
              return `${k}: {...}`;
            }
            return `${k}: ${val}`;
          })
          .join(', ');
      }
      return JSON.stringify(details).substring(0, 100) + '...';
    } catch {
      return String(details);
    }
  }

  getCheckStatusClass(status: string): string {
    switch (status) {
      case 'PASSED':
        return 'status-pass';
      case 'FAILED':
        return 'status-fail';
      case 'WARNING':
        return 'status-warning';
      case 'NOT_APPLICABLE':
        return 'status-na';
      default:
        return '';
    }
  }

  getCheckStatusIcon(status: string): string {
    switch (status) {
      case 'PASSED':
        return 'check_circle';
      case 'FAILED':
        return 'cancel';
      case 'WARNING':
        return 'warning';
      case 'NOT_APPLICABLE':
        return 'remove_circle';
      default:
        return 'help';
    }
  }
}
