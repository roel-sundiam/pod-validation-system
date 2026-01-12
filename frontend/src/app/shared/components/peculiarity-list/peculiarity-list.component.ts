import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { Peculiarity } from '../../../core/models/pod.model';

@Component({
  selector: 'app-peculiarity-list',
  standalone: true,
  imports: [CommonModule, MatListModule, MatIconModule, MatChipsModule],
  template: `
    <mat-list *ngIf="peculiarities && peculiarities.length > 0">
      <mat-list-item *ngFor="let peculiarity of peculiarities">
        <mat-icon matListItemIcon [class]="'severity-' + peculiarity.severity.toLowerCase()">
          {{ getSeverityIcon(peculiarity.severity) }}
        </mat-icon>
        <div matListItemTitle>
          <mat-chip [class]="'severity-chip-' + peculiarity.severity.toLowerCase()">
            {{ peculiarity.severity }}
          </mat-chip>
          <span class="peculiarity-type">{{ formatType(peculiarity.type) }}</span>
        </div>
        <div matListItemLine class="peculiarity-description">
          {{ peculiarity.description }}
        </div>
        <div matListItemLine *ngIf="peculiarity.field" class="peculiarity-field">
          Field: <strong>{{ peculiarity.field }}</strong>
        </div>
      </mat-list-item>
    </mat-list>
    <p *ngIf="!peculiarities || peculiarities.length === 0" class="no-peculiarities">
      <mat-icon>check_circle</mat-icon>
      No issues detected
    </p>
  `,
  styles: [`
    .severity-low {
      color: #2196f3;
    }

    .severity-medium {
      color: #ff9800;
    }

    .severity-high {
      color: #f44336;
    }

    .severity-chip-low {
      background-color: #e3f2fd !important;
      color: #1976d2 !important;
      font-size: 11px;
      min-height: 20px;
      padding: 0 8px;
    }

    .severity-chip-medium {
      background-color: #fff3e0 !important;
      color: #f57c00 !important;
      font-size: 11px;
      min-height: 20px;
      padding: 0 8px;
    }

    .severity-chip-high {
      background-color: #ffebee !important;
      color: #c62828 !important;
      font-size: 11px;
      min-height: 20px;
      padding: 0 8px;
    }

    .peculiarity-type {
      margin-left: 8px;
      font-weight: 500;
    }

    .peculiarity-description {
      color: rgba(0, 0, 0, 0.6);
      font-size: 14px;
      margin-top: 4px;
    }

    .peculiarity-field {
      color: rgba(0, 0, 0, 0.54);
      font-size: 12px;
      font-style: italic;
    }

    .no-peculiarities {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #4caf50;
      padding: 16px;
      margin: 0;

      mat-icon {
        color: #4caf50;
      }
    }

    mat-list-item {
      margin-bottom: 8px;
      border-bottom: 1px solid #e0e0e0;
    }
  `]
})
export class PeculiarityListComponent {
  @Input() peculiarities: Peculiarity[] = [];

  getSeverityIcon(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'low':
        return 'info';
      case 'medium':
        return 'warning';
      case 'high':
        return 'error';
      default:
        return 'info';
    }
  }

  formatType(type: string): string {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
