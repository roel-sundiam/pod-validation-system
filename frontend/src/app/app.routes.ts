import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
  },
  {
    path: 'upload',
    loadComponent: () =>
      import('./features/upload/upload.component').then(
        (m) => m.UploadComponent
      ),
  },
  {
    path: 'document/:id',
    loadComponent: () =>
      import('./features/document-viewer/document-viewer.component').then(
        (m) => m.DocumentViewerComponent
      ),
  },
  {
    path: 'admin/clients',
    loadComponent: () =>
      import('./features/admin/client-list.component').then(
        (m) => m.ClientListComponent
      ),
  },
  {
    path: 'admin/clients/new',
    loadComponent: () =>
      import('./features/admin/client-config-editor.component').then(
        (m) => m.ClientConfigEditorComponent
      ),
  },
  {
    path: 'admin/clients/:clientId/edit',
    loadComponent: () =>
      import('./features/admin/client-config-editor.component').then(
        (m) => m.ClientConfigEditorComponent
      ),
  },
  {
    path: '**',
    redirectTo: '/dashboard',
  },
];
