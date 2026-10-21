import { Routes } from '@angular/router';
import { authGuard, homeGuard, roleGuard } from './core/guards';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.Login) },
  {
    path: 'cambiar-clave',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/change-password/change-password').then((m) => m.ChangePassword),
  },
  {
    path: 'mi-reto',
    canActivate: [roleGuard('USER')],
    loadComponent: () => import('./pages/my-challenge/my-challenge').then((m) => m.MyChallenge),
  },
  {
    path: 'retos',
    canActivate: [roleGuard('GHD', 'ADMIN')],
    loadComponent: () => import('./pages/challenges/challenges').then((m) => m.Challenges),
  },
  {
    path: 'usuarios',
    canActivate: [roleGuard('GHD', 'ADMIN')],
    loadComponent: () => import('./pages/users/users').then((m) => m.Users),
  },
  {
    path: 'plantillas',
    canActivate: [roleGuard('ADMIN')],
    loadComponent: () => import('./pages/templates/templates').then((m) => m.Templates),
  },
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
  { path: '**', redirectTo: '' },
];
