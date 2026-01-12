import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ClientConfigService } from '../../core/services/client-config.service';
import {
  ClientValidationConfig,
  ValidationRuleSet,
} from '../../core/models/client-config.model';

@Component({
  selector: 'app-client-config-editor',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatExpansionModule,
    MatSelectModule,
    MatSliderModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './client-config-editor.component.html',
  styleUrls: ['./client-config-editor.component.scss'],
})
export class ClientConfigEditorComponent implements OnInit {
  configForm!: FormGroup;
  loading = true;
  saving = false;
  isEditMode = false;
  clientId: string | null = null;
  originalConfig: ClientValidationConfig | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private clientConfigService: ClientConfigService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initializeForm();

    this.clientId = this.route.snapshot.paramMap.get('clientId');

    if (this.clientId && this.clientId !== 'new') {
      this.isEditMode = true;
      this.loadClientConfig(this.clientId);
    } else {
      this.loading = false;
    }
  }

  initializeForm(): void {
    this.configForm = this.fb.group({
      // Basic Info
      clientId: ['', [Validators.required, Validators.pattern(/^[A-Z0-9_]+$/)]],
      clientName: ['', Validators.required],
      description: [''],

      // Document Completeness
      documentCompleteness: this.fb.group({
        requirePalletNotificationLetter: [false],
        requireLoscamDocument: [false],
        requireCustomerPalletReceiving: [false],
        requireShipDocument: [true],
        requireInvoice: [true],
        requireRAR: [true],
        palletScenario: ['AUTO_DETECT'],
      }),

      // Pallet Validation
      palletValidation: this.fb.group({
        enabled: [false],
        requireWarehouseStamp: [false],
        requireWarehouseSignature: [false],
        requireCustomerSignature: [false],
        requireDriverSignature: [false],
        requireLoscamStamp: [false],
      }),

      // Ship Document Validation
      shipDocumentValidation: this.fb.group({
        enabled: [true],
        requireDispatchStamp: [true],
        requirePalletStamp: [false],
        requireNoPalletStamp: [false],
        requireSecuritySignature: [true],
        requireTimeOutField: [false],
        requireDriverSignature: [false],
      }),

      // Invoice Validation
      invoiceValidation: this.fb.group({
        enabled: [true],
        requirePOMatch: [true],
        requireTotalCasesMatch: [true],
        allowedVariancePercent: [0],
        requireItemLevelMatch: [false],
      }),

      // Cross Document Validation
      crossDocumentValidation: this.fb.group({
        enabled: [true],
        validateInvoiceRAR: [true],
        allowedDiscrepancyCount: [0],
        strictMode: [true],
      }),
    });

    // Disable clientId in edit mode
    if (this.isEditMode) {
      this.configForm.get('clientId')?.disable();
    }
  }

  loadClientConfig(clientId: string): void {
    this.clientConfigService.getClientConfig(clientId).subscribe({
      next: (response) => {
        this.originalConfig = response.data;
        this.patchFormValues(response.data);
        this.loading = false;
      },
      error: (error) => {
        this.snackBar.open(`Error loading config: ${error.message}`, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar'],
        });
        this.loading = false;
      },
    });
  }

  patchFormValues(config: ClientValidationConfig): void {
    this.configForm.patchValue({
      clientId: config.clientId,
      clientName: config.clientName,
      description: config.description,
      documentCompleteness: config.validationRules.documentCompleteness,
      palletValidation: config.validationRules.palletValidation,
      shipDocumentValidation: config.validationRules.shipDocumentValidation,
      invoiceValidation: config.validationRules.invoiceValidation,
      crossDocumentValidation: config.validationRules.crossDocumentValidation,
    });
  }

  onSubmit(): void {
    if (this.configForm.invalid) {
      this.snackBar.open('Please fill in all required fields', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar'],
      });
      return;
    }

    this.saving = true;
    const formValue = this.configForm.getRawValue();

    const configData: Partial<ClientValidationConfig> = {
      clientId: formValue.clientId,
      clientName: formValue.clientName,
      description: formValue.description,
      validationRules: {
        documentCompleteness: formValue.documentCompleteness,
        palletValidation: formValue.palletValidation,
        shipDocumentValidation: formValue.shipDocumentValidation,
        invoiceValidation: {
          ...formValue.invoiceValidation,
          compareFields: this.getCompareFields(formValue.invoiceValidation),
        },
        crossDocumentValidation: formValue.crossDocumentValidation,
      } as ValidationRuleSet,
      updatedBy: 'ADMIN', // TODO: Get from auth context
    };

    const operation = this.isEditMode
      ? this.clientConfigService.updateClientConfig(
          formValue.clientId,
          configData
        )
      : this.clientConfigService.createClientConfig(configData);

    operation.subscribe({
      next: (response) => {
        this.snackBar.open(
          this.isEditMode
            ? 'Configuration updated successfully'
            : 'Configuration created successfully',
          'Close',
          { duration: 3000 }
        );
        this.saving = false;
        this.router.navigate(['/admin/clients']);
      },
      error: (error) => {
        this.snackBar.open(
          `Error saving configuration: ${error.message}`,
          'Close',
          {
            duration: 5000,
            panelClass: ['error-snackbar'],
          }
        );
        this.saving = false;
      },
    });
  }

  getCompareFields(invoiceValidation: any): string[] {
    const fields: string[] = [];
    if (invoiceValidation.requirePOMatch) fields.push('poNumber');
    if (invoiceValidation.requireTotalCasesMatch) fields.push('totalCases');
    if (invoiceValidation.requireItemLevelMatch) fields.push('items');
    return fields;
  }

  cancel(): void {
    if (this.configForm.dirty) {
      if (
        confirm('You have unsaved changes. Are you sure you want to leave?')
      ) {
        this.router.navigate(['/admin/clients']);
      }
    } else {
      this.router.navigate(['/admin/clients']);
    }
  }

  formatVarianceLabel(value: number): string {
    return `${value}%`;
  }
}
