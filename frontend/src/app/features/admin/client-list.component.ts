import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ClientConfigService } from '../../core/services/client-config.service';
import { ClientValidationConfig } from '../../core/models/client-config.model';

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './client-list.component.html',
  styleUrls: ['./client-list.component.scss'],
})
export class ClientListComponent implements OnInit {
  clients: ClientValidationConfig[] = [];
  displayedColumns: string[] = [
    'clientId',
    'clientName',
    'description',
    'validationTypes',
    'updatedAt',
    'actions',
  ];
  loading = true;
  error: string | null = null;

  constructor(
    private clientConfigService: ClientConfigService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadClients();
  }

  loadClients(): void {
    this.loading = true;
    this.error = null;

    this.clientConfigService.getAllClients().subscribe({
      next: (response) => {
        this.clients = response.data;
        this.loading = false;
      },
      error: (error) => {
        this.error = error.message;
        this.loading = false;
        this.snackBar.open(`Error loading clients: ${error.message}`, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar'],
        });
      },
    });
  }

  getValidationTypes(config: ClientValidationConfig): string[] {
    const types: string[] = [];

    if (config.validationRules.palletValidation.enabled) {
      types.push('Pallet');
    }
    if (config.validationRules.shipDocumentValidation.enabled) {
      types.push('Ship Doc');
    }
    if (config.validationRules.invoiceValidation.enabled) {
      types.push('Invoice');
    }
    if (config.validationRules.crossDocumentValidation.enabled) {
      types.push('Cross-Doc');
    }

    return types;
  }

  editClient(clientId: string): void {
    // Navigate to edit page
    console.log('Edit client:', clientId);
  }

  viewPreview(clientId: string): void {
    this.clientConfigService.previewValidationChecks(clientId).subscribe({
      next: (response) => {
        console.log('Preview:', response.data);
        // TODO: Open dialog with preview
        this.snackBar.open('Preview loaded successfully', 'Close', {
          duration: 3000,
        });
      },
      error: (error) => {
        this.snackBar.open(`Error loading preview: ${error.message}`, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar'],
        });
      },
    });
  }

  deleteClient(client: ClientValidationConfig): void {
    if (client.clientId === 'SUPER8') {
      this.snackBar.open('Cannot deactivate SUPER8 configuration', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar'],
      });
      return;
    }

    if (confirm(`Are you sure you want to deactivate ${client.clientName}?`)) {
      this.clientConfigService
        .deactivateClient(client.clientId, 'ADMIN')
        .subscribe({
          next: () => {
            this.snackBar.open(
              `${client.clientName} deactivated successfully`,
              'Close',
              {
                duration: 3000,
              }
            );
            this.loadClients();
          },
          error: (error) => {
            this.snackBar.open(
              `Error deactivating client: ${error.message}`,
              'Close',
              {
                duration: 5000,
                panelClass: ['error-snackbar'],
              }
            );
          },
        });
    }
  }

  clearCache(clientId?: string): void {
    this.clientConfigService.clearCache(clientId).subscribe({
      next: () => {
        this.snackBar.open(
          clientId ? `Cache cleared for ${clientId}` : 'All cache cleared',
          'Close',
          { duration: 3000 }
        );
      },
      error: (error) => {
        this.snackBar.open(`Error clearing cache: ${error.message}`, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar'],
        });
      },
    });
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  }
}
