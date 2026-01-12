import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import {
  DeliveryValidationChecklist,
  ValidationCheckItem,
  CheckStatus,
  DocumentValidationChecklist,
} from '../../../core/models/pod.model';

@Component({
  selector: 'app-validation-checklist',
  standalone: true,
  imports: [
    CommonModule,
    MatExpansionModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
  ],
  templateUrl: './validation-checklist.component.html',
  styleUrls: ['./validation-checklist.component.scss'],
})
export class ValidationChecklistComponent {
  @Input() checklist?: DeliveryValidationChecklist;
  @Input() documents?: any[]; // Debug: show document types
  showDebug = true; // Set to true to always show debug panel

  getStatusIcon(status: CheckStatus): string {
    switch (status) {
      case 'PASSED':
        return 'check_circle';
      case 'FAILED':
        return 'cancel';
      case 'WARNING':
        return 'warning';
      case 'NOT_APPLICABLE':
        return 'remove_circle_outline';
      default:
        return 'help_outline';
    }
  }

  getStatusClass(status: CheckStatus): string {
    switch (status) {
      case 'PASSED':
        return 'status-passed';
      case 'FAILED':
        return 'status-failed';
      case 'WARNING':
        return 'status-warning';
      case 'NOT_APPLICABLE':
        return 'status-na';
      default:
        return '';
    }
  }

  getStatusColor(status: CheckStatus): string {
    switch (status) {
      case 'PASSED':
        return 'primary';
      case 'FAILED':
        return 'warn';
      case 'WARNING':
        return 'accent';
      default:
        return '';
    }
  }

  formatDocumentType(docType: string): string {
    return docType
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  getCheckCount(checks: ValidationCheckItem[], status: CheckStatus): number {
    return checks.filter((c) => c.status === status).length;
  }

  getAllChecks(): ValidationCheckItem[] {
    if (!this.checklist) return [];

    return [
      ...this.checklist.documentCompleteness,
      ...this.checklist.documentSpecificChecks.flatMap((d) => d.checks),
      ...this.checklist.crossDocumentChecks,
    ];
  }

  getOverallStats() {
    const allChecks = this.getAllChecks();
    return {
      total: allChecks.length,
      passed: this.getCheckCount(allChecks, 'PASSED'),
      failed: this.getCheckCount(allChecks, 'FAILED'),
      warning: this.getCheckCount(allChecks, 'WARNING'),
      na: this.getCheckCount(allChecks, 'NOT_APPLICABLE'),
    };
  }

  getShipDocumentSection(): DocumentValidationChecklist | undefined {
    if (!this.checklist) return undefined;
    return this.checklist.documentSpecificChecks.find(
      (section) => section.documentType === 'SHIP_DOCUMENT'
    );
  }

  getInvoiceSection(): DocumentValidationChecklist | undefined {
    if (!this.checklist) return undefined;
    return this.checklist.documentSpecificChecks.find(
      (section) => section.documentType === 'INVOICE'
    );
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
}
