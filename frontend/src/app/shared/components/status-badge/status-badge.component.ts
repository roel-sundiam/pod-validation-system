import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule, MatChipsModule, MatIconModule],
  template: `
    <mat-chip
      [class]="'status-chip status-' + status.toLowerCase()"
      [attr.aria-label]="status">
      <mat-icon>{{ getIcon() }}</mat-icon>
      <span>{{ status }}</span>
    </mat-chip>
  `,
  styles: [`
    .status-chip {
      font-weight: 500;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        margin-right: 4px;
      }
    }

    .status-pass {
      background-color: #4caf50 !important;
      color: white !important;
    }

    .status-fail {
      background-color: #f44336 !important;
      color: white !important;
    }

    .status-review {
      background-color: #ff9800 !important;
      color: white !important;
    }

    .status-uploaded,
    .status-processing {
      background-color: #2196f3 !important;
      color: white !important;
    }

    .status-completed {
      background-color: #4caf50 !important;
      color: white !important;
    }

    .status-failed {
      background-color: #f44336 !important;
      color: white !important;
    }
  `]
})
export class StatusBadgeComponent {
  @Input() status!: string;

  getIcon(): string {
    const statusLower = this.status.toLowerCase();
    switch (statusLower) {
      case 'pass':
      case 'completed':
        return 'check_circle';
      case 'fail':
      case 'failed':
        return 'cancel';
      case 'review':
        return 'warning';
      case 'processing':
        return 'hourglass_empty';
      case 'uploaded':
        return 'cloud_upload';
      default:
        return 'info';
    }
  }
}
