import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { interval, Subscription } from 'rxjs';
import { ValidationService, PODListParams } from '../../core/services/validation.service';
import { PODDocument, StatisticsSummary } from '../../core/models/pod.model';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { DeliveryService, Delivery, DeliveryListParams, DeliveryValidationResponse } from '../../core/services/delivery.service';
import { ValidationChecklistComponent } from '../../shared/components/validation-checklist/validation-checklist.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    StatusBadgeComponent,
    ValidationChecklistComponent,
    MatExpansionModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  pods: PODDocument[] = [];
  deliveries: Delivery[] = [];
  deliveryValidations: Map<string, DeliveryValidationResponse> = new Map();
  displayedColumns: string[] = ['fileName', 'uploadDate', 'client', 'status', 'validationStatus', 'peculiarities', 'actions'];

  // View mode
  viewMode: 'pods' | 'deliveries' = 'deliveries';

  // Filters
  statusFilter: string = '';
  clientFilter: string = '';

  // Pagination
  totalItems = 0;
  pageSize = 10;
  pageIndex = 0;

  // Statistics
  statistics: StatisticsSummary | null = null;

  // Loading states
  isLoading = false;
  isLoadingStats = false;

  // Polling for processing deliveries
  private pollingSubscription?: Subscription;
  private readonly POLL_INTERVAL = 3000; // Poll every 3 seconds

  constructor(
    private validationService: ValidationService,
    private deliveryService: DeliveryService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadDeliveries();
    this.loadStatistics();
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    // Poll every 3 seconds to check for processing deliveries
    this.pollingSubscription = interval(this.POLL_INTERVAL).subscribe(() => {
      this.checkProcessingDeliveries();
    });
  }

  private stopPolling(): void {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }
  }

  private checkProcessingDeliveries(): void {
    // Find deliveries that are PROCESSING or UPLOADED
    const processingDeliveries = this.deliveries.filter(
      d => d.status === 'PROCESSING' || d.status === 'UPLOADED'
    );

    if (processingDeliveries.length === 0) {
      return;
    }

    // Refresh those deliveries
    processingDeliveries.forEach(delivery => {
      this.deliveryService.getDeliveryById(delivery._id).subscribe({
        next: (updated) => {
          // Update delivery in the list
          const index = this.deliveries.findIndex(d => d._id === delivery._id);
          if (index !== -1) {
            this.deliveries[index] = updated;

            // If status changed to COMPLETED, reload validation
            if (updated.status === 'COMPLETED') {
              this.deliveryValidations.delete(delivery._id); // Clear cache
              this.loadDeliveryValidation(delivery._id);
            }
          }
        },
        error: (error) => {
          console.error('Error polling delivery:', error);
        }
      });
    });
  }

  loadPODs(): void {
    this.isLoading = true;

    const params: PODListParams = {
      page: this.pageIndex + 1, // Backend uses 1-based indexing
      limit: this.pageSize,
    };

    if (this.statusFilter) {
      params.status = this.statusFilter as any;
    }

    if (this.clientFilter) {
      params.clientIdentifier = this.clientFilter;
    }

    this.validationService.listPODs(params).subscribe({
      next: (response) => {
        this.pods = response.pods;
        this.totalItems = response.pagination.total;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading PODs:', error);
        this.snackBar.open(`Error loading PODs: ${error.message}`, 'Close', {
          duration: 5000
        });
        this.isLoading = false;
      }
    });
  }

  loadDeliveries(): void {
    this.isLoading = true;

    const params: DeliveryListParams = {
      page: this.pageIndex + 1,
      limit: this.pageSize,
    };

    if (this.statusFilter) {
      params.status = this.statusFilter;
    }

    if (this.clientFilter) {
      params.clientIdentifier = this.clientFilter;
    }

    this.deliveryService.listDeliveries(params).subscribe({
      next: (response) => {
        this.deliveries = response.deliveries;
        this.totalItems = response.pagination.totalItems;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading deliveries:', error);
        this.snackBar.open(`Error loading deliveries: ${error.message}`, 'Close', {
          duration: 5000
        });
        this.isLoading = false;
      }
    });
  }

  loadDeliveryValidation(deliveryId: string): void {
    // Only load if not already loaded
    if (this.deliveryValidations.has(deliveryId)) {
      return;
    }

    this.deliveryService.getDeliveryValidation(deliveryId).subscribe({
      next: (validation) => {
        this.deliveryValidations.set(deliveryId, validation);
      },
      error: (error) => {
        console.error('Error loading delivery validation:', error);
      }
    });
  }

  getDeliveryValidation(deliveryId: string): DeliveryValidationResponse | undefined {
    return this.deliveryValidations.get(deliveryId);
  }

  loadStatistics(): void {
    this.isLoadingStats = true;

    this.validationService.getStatistics({ status: 'COMPLETED' }).subscribe({
      next: (stats) => {
        this.statistics = stats;
        this.isLoadingStats = false;
      },
      error: (error) => {
        console.error('Error loading statistics:', error);
        this.isLoadingStats = false;
      }
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadDeliveries();
  }

  onFilterChange(): void {
    this.pageIndex = 0; // Reset to first page
    this.loadDeliveries();
  }

  clearFilters(): void {
    this.statusFilter = '';
    this.clientFilter = '';
    this.onFilterChange();
  }

  refreshData(): void {
    this.deliveryValidations.clear(); // Clear cached validations
    this.loadDeliveries();
    this.loadStatistics();
  }

  viewDetails(pod: PODDocument): void {
    this.router.navigate(['/document', pod._id]);
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleString();
  }

  getValidationStatus(pod: PODDocument): string {
    if (pod.status !== 'COMPLETED' || !pod.validationResult) {
      return pod.status;
    }
    return pod.validationResult.status;
  }

  getPeculiarityCount(pod: PODDocument): number {
    return pod.validationResult?.peculiarities?.length || 0;
  }

  getPassPercentage(): number {
    if (!this.statistics) return 0;
    const total = this.statistics.statusBreakdown.pass +
                  this.statistics.statusBreakdown.fail +
                  this.statistics.statusBreakdown.review;
    return total > 0 ? Math.round((this.statistics.statusBreakdown.pass / total) * 100) : 0;
  }

  getReviewPercentage(): number {
    if (!this.statistics) return 0;
    const total = this.statistics.statusBreakdown.pass +
                  this.statistics.statusBreakdown.fail +
                  this.statistics.statusBreakdown.review;
    return total > 0 ? Math.round((this.statistics.statusBreakdown.review / total) * 100) : 0;
  }

  getFailPercentage(): number {
    if (!this.statistics) return 0;
    const total = this.statistics.statusBreakdown.pass +
                  this.statistics.statusBreakdown.fail +
                  this.statistics.statusBreakdown.review;
    return total > 0 ? Math.round((this.statistics.statusBreakdown.fail / total) * 100) : 0;
  }
}
