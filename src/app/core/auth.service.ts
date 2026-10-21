import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_URL } from './config';
import { LoginResponse, Role, User } from './models';

const TOKEN_KEY = 'retos.token';
const USER_KEY = 'retos.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(this.readUser());
  readonly isLoggedIn = computed(() => this.user() !== null && this.token() !== null);

  token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_URL}/auth/login`, { username, password }).pipe(
      tap((res) => {
        try {
          localStorage.setItem(TOKEN_KEY, res.token);
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        } catch {
          /* almacenamiento no disponible */
        }
        this.user.set(res.user);
      }),
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http
      .post<void>(`${API_URL}/auth/change-password`, { currentPassword, newPassword })
      .pipe(tap(() => this.patchUser({ mustChangePassword: false })));
  }

  logout(redirect = true): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* noop */
    }
    this.user.set(null);
    if (redirect) {
      this.router.navigateByUrl('/login');
    }
  }

  hasRole(...roles: Role[]): boolean {
    const u = this.user();
    return !!u && roles.includes(u.role);
  }

  homeUrl(): string {
    const u = this.user();
    if (!u) return '/login';
    if (u.mustChangePassword) return '/cambiar-clave';
    return u.role === 'USER' ? '/mi-reto' : '/retos';
  }

  private patchUser(patch: Partial<User>): void {
    const u = this.user();
    if (!u) return;
    const next = { ...u, ...patch };
    this.user.set(next);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }

  private readUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }
}
