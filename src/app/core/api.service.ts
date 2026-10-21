import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, Signal, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './config';
import {
  AppSettings,
  Challenge,
  DEFAULT_SETTINGS,
  CreateUserRequest,
  CreateUserResponse,
  GradeResult,
  Level,
  Track,
  User,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private readonly settingsState = signal<AppSettings>(DEFAULT_SETTINGS);
  private settingsRequested = false;

  // ---- catalogo ----
  tracks(): Observable<Record<Track, Level[]>> {
    return this.http.get<Record<Track, Level[]>>(`${API_URL}/tracks`);
  }

  /** Límites del backend (se piden una vez; mientras tanto se usan los valores por defecto). */
  settings(): Signal<AppSettings> {
    if (!this.settingsRequested) {
      this.settingsRequested = true;
      this.http.get<AppSettings>(`${API_URL}/settings`).subscribe({
        next: (s) => this.settingsState.set(s),
        error: () => (this.settingsRequested = false),
      });
    }
    return this.settingsState.asReadonly();
  }

  // ---- notificaciones (GHD / ADMIN) ----
  testNotification(to: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_URL}/notifications/test`, { to });
  }

  // ---- usuarios (GHD / ADMIN) ----
  users(): Observable<User[]> {
    return this.http.get<User[]>(`${API_URL}/users`);
  }

  createUser(body: CreateUserRequest): Observable<CreateUserResponse> {
    return this.http.post<CreateUserResponse>(`${API_URL}/users`, body);
  }

  setUserActive(id: number, value: boolean): Observable<User> {
    return this.http.patch<User>(`${API_URL}/users/${id}/active`, null, { params: { value } });
  }

  // ---- retos ----
  challenges(): Observable<Challenge[]> {
    return this.http.get<Challenge[]>(`${API_URL}/challenges`);
  }

  /** Asigna uno o varios niveles del mismo módulo; atómico en el backend. */
  assign(candidateId: number, track: Track, levels: Level[], durationMinutes: number): Observable<Challenge[]> {
    return this.http.post<Challenge[]>(`${API_URL}/challenges`, { candidateId, track, levels, durationMinutes });
  }

  updateDuration(id: number, durationMinutes: number): Observable<Challenge> {
    return this.http.patch<Challenge>(`${API_URL}/challenges/${id}/duration`, { durationMinutes });
  }

  start(id: number): Observable<Challenge> {
    return this.http.post<Challenge>(`${API_URL}/challenges/${id}/start`, null);
  }

  downloadTemplate(id: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`${API_URL}/challenges/${id}/download`, { observe: 'response', responseType: 'blob' });
  }

  submit(id: number, file: File): Observable<Challenge> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Challenge>(`${API_URL}/challenges/${id}/submit`, form);
  }

  downloadSubmission(id: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`${API_URL}/challenges/${id}/submission`, { observe: 'response', responseType: 'blob' });
  }

  grade(id: number, result: GradeResult, comment: string): Observable<Challenge> {
    return this.http.post<Challenge>(`${API_URL}/challenges/${id}/grade`, { result, comment });
  }

  // ---- carpeta de codigo de cada reto (ADMIN) ----
  uploadTemplate(track: Track, level: Level, file: File): Observable<void> {
    const form = new FormData();
    form.append('file', file);
    return this.http.put<void>(`${API_URL}/templates/${track}/${level}`, form);
  }
}

/** Guarda en disco la respuesta binaria usando el nombre de Content-Disposition. */
export function saveDownload(resp: HttpResponse<Blob>, fallbackName: string): void {
  const header = resp.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(resp.body as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Extrae un mensaje legible de un error HTTP (tambien cuando la respuesta era un Blob). */
export async function errorMessage(err: unknown): Promise<string> {
  if (err instanceof HttpErrorResponse) {
    let body: unknown = err.error;
    if (body instanceof Blob) {
      try {
        body = JSON.parse(await body.text());
      } catch {
        body = null;
      }
    }
    const msg = (body as { message?: string } | null)?.message;
    if (msg) return msg;
    if (err.status === 0) return 'No se pudo conectar con el servidor';
    if (err.status === 403) return 'No tienes permiso para esta accion';
    if (err.status === 413) return 'El archivo supera el tamaño máximo permitido';
  }
  return 'Ocurrio un error inesperado';
}
