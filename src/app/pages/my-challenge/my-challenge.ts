import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService, errorMessage, saveDownload } from '../../core/api.service';
import { Challenge, LEVEL_LABEL, STATUS_LABEL, TRACK_LABEL } from '../../core/models';
import { formatBytes, formatMinutes, zipFileError } from '../../core/validators';

@Component({
  selector: 'app-my-challenge',
  imports: [DatePipe],
  template: `
    <section class="page">
      <div class="row between">
        <div>
          <h1>Mis retos técnicos</h1>
          <p class="muted">Visualiza, inicia y entrega tus retos de evaluación técnica.</p>
        </div>
        <button class="btn" (click)="load()" [disabled]="loading()">Actualizar</button>
      </div>

      @if (error()) {
        <p class="alert error">{{ error() }}</p>
      }
      @if (info()) {
        <p class="alert ok">{{ info() }}</p>
      }

      @if (loading()) {
        <p class="muted">Cargando retos…</p>
      } @else if (all().length === 0) {
        <div class="card">
          <p>Todavía no tienes ningún reto asignado. Gestión Humana (GHD) te asignará uno pronto.</p>
        </div>
      } @else {
        <!-- Sección de Retos Activos: primero el que está en curso, luego los pendientes -->
        @if (activeChallenges().length > 0) {
          <h2>Retos activos ({{ activeChallenges().length }})</h2>
          @if (inProgress() && pendingCount() > 0) {
            <p class="alert info" style="font-size: 13.5px;">
              Solo puedes tener un reto en curso. Entrega <strong>{{ trackLabel(inProgress()!) }} ·
              {{ levelLabel(inProgress()!) }}</strong> (o espera a que termine su tiempo) para iniciar el siguiente.
            </p>
          }
          <div class="challenges-grid">
            @for (c of activeChallenges(); track c.id) {
              <div class="card challenge-card" [class.current]="c.status === 'IN_PROGRESS'">
                <div class="row between">
                  <div>
                    <h2>Reto {{ trackLabel(c) }} · {{ levelLabel(c) }}</h2>
                    <p class="muted small">Duración: {{ formatMinutes(c.durationMinutes) }} desde el inicio.</p>
                  </div>
                  <span class="badge" [class]="'badge s-' + c.status">{{ statusLabel(c) }}</span>
                </div>

                @if (c.status === 'ASSIGNED') {
                  <div class="alert info" style="font-size: 13.5px;">
                    Al presionar <strong>Iniciar reto</strong> se descargará la carpeta de código y empezará a correr
                    tu tiempo de {{ formatMinutes(c.durationMinutes) }}. No se puede pausar.
                  </div>
                  <button
                    class="btn primary"
                    [disabled]="busyId() === c.id || !!inProgress()"
                    [title]="inProgress() ? 'Termina primero el reto en curso' : ''"
                    (click)="startAndDownload(c)"
                  >
                    {{ busyId() === c.id ? 'Iniciando…' : 'Iniciar reto y descargar código' }}
                  </button>
                  @if (inProgress()) {
                    <span class="muted small">
                      Disponible cuando entregues o venza {{ trackLabel(inProgress()!) }} · {{ levelLabel(inProgress()!) }}.
                    </span>
                  }
                }

                @if (c.status === 'IN_PROGRESS') {
                  <div class="timer" [class.low]="remainingFor(c) <= 600">
                    <span class="timer-label">Tiempo restante</span>
                    <span class="timer-value">{{ clockFor(c) }}</span>
                    <span class="muted small">Termina el {{ c.deadlineAt | date: 'dd/MM/yyyy HH:mm:ss' }}</span>
                  </div>

                  <div class="stack">
                    <div>
                      <h3>1. Carpeta de código</h3>
                      <button class="btn" [disabled]="busyId() === c.id" (click)="download(c)">
                        Descargar de nuevo
                      </button>
                    </div>

                    <div>
                      <h3>2. Entrega tu solución</h3>
                      <p class="muted small">
                        Comprime tu carpeta de código en un archivo .zip y cárgalo antes de que termine el tiempo.
                      </p>
                      <div class="row">
                        <input
                          type="file"
                          accept=".zip,application/zip"
                          [class.is-invalid]="fileError(c.id)"
                          (change)="onFile(c.id, $event)"
                        />
                        <button
                          class="btn primary"
                          [disabled]="busyId() === c.id || !hasFile(c.id) || !!fileError(c.id)"
                          (click)="submit(c)"
                        >
                          {{ busyId() === c.id ? 'Subiendo…' : 'Entregar reto' }}
                        </button>
                      </div>
                      @if (fileError(c.id); as m) {
                        <span class="field-error">{{ m }}</span>
                      }
                      <p class="muted small" style="margin-top: 4px;">
                        Solo .zip, máximo {{ maxUpload() }}. La entrega es definitiva: solo se puede cargar una vez.
                      </p>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        } @else {
          <div class="card">
            <p>No tienes retos pendientes por realizar actualmente.</p>
          </div>
        }

        <!-- Sección de Historial de Retos (Entregados, Vencidos o Calificados) -->
        @if (historyChallenges().length > 0) {
          <h2>Historial de entregas y calificaciones ({{ historyChallenges().length }})</h2>
          <div class="table-wrap card">
            <table>
              <thead>
                <tr>
                  <th>Reto</th>
                  <th>Asignado</th>
                  <th>Entrega</th>
                  <th>Estado</th>
                  <th>Resultado</th>
                  <th>Retroalimentación</th>
                </tr>
              </thead>
              <tbody>
                @for (h of historyChallenges(); track h.id) {
                  <tr>
                    <td><strong>{{ trackLabel(h) }} · {{ levelLabel(h) }}</strong></td>
                    <td>{{ h.assignedAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                    <td>{{ h.submittedAt ? (h.submittedAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                    <td><span class="badge" [class]="'badge s-' + h.status">{{ statusLabel(h) }}</span></td>
                    <td>
                      @if (h.result) {
                        <span class="badge" [class]="'badge r-' + h.result">
                          {{ h.result === 'APTO' ? 'APTO' : 'NO APTO' }}
                        </span>
                      } @else {
                        <span class="muted small">En espera</span>
                      }
                    </td>
                    <td>
                      @if (h.gradeComment) {
                        <span>{{ h.gradeComment }}</span>
                      } @else {
                        <span class="muted small">—</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </section>
  `,
})
export class MyChallenge implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  readonly all = signal<Challenge[]>([]);
  readonly loading = signal(true);
  readonly busyId = signal<number | null>(null);
  readonly error = signal('');
  readonly info = signal('');
  readonly now = signal(Date.now());

  private readonly fileMap = signal<Record<number, File>>({});
  private readonly fileErrors = signal<Record<number, string>>({});
  private readonly settings = this.api.settings();
  readonly maxUpload = computed(() => formatBytes(this.settings().maxUploadBytes));
  readonly formatMinutes = formatMinutes;

  /** El reto en curso va primero; luego los pendientes del más antiguo al más reciente. */
  readonly activeChallenges = computed(() => [
    ...this.all().filter((c) => c.status === 'IN_PROGRESS'),
    ...this.all()
      .filter((c) => c.status === 'ASSIGNED')
      .reverse(),
  ]);

  readonly inProgress = computed(() => this.all().find((c) => c.status === 'IN_PROGRESS') ?? null);
  readonly pendingCount = computed(() => this.all().filter((c) => c.status === 'ASSIGNED').length);

  readonly historyChallenges = computed(() =>
    this.all().filter(
      (c) => c.status === 'SUBMITTED' || c.status === 'EXPIRED' || c.status === 'GRADED',
    ),
  );

  private timer?: ReturnType<typeof setInterval>;
  private ticks = 0;

  ngOnInit(): void {
    this.load();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  trackLabel = (c: Challenge) => TRACK_LABEL[c.track];
  levelLabel = (c: Challenge) => LEVEL_LABEL[c.level];
  statusLabel = (c: Challenge) => STATUS_LABEL[c.status];

  remainingFor(c: Challenge): number {
    if (c.status !== 'IN_PROGRESS' || !c.deadlineAt) return 0;
    const deadline = new Date(c.deadlineAt).getTime();
    return Math.max(0, Math.floor((deadline - this.now()) / 1000));
  }

  clockFor(c: Challenge): string {
    const s = this.remainingFor(c);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
  }

  onFile(challengeId: number, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.fileErrors.update((errs) => {
      const copy = { ...errs };
      const err = file ? zipFileError(file, this.settings().maxUploadBytes) : null;
      if (err) {
        copy[challengeId] = err;
      } else {
        delete copy[challengeId];
      }
      return copy;
    });
    this.fileMap.update((map) => {
      const copy = { ...map };
      if (file) {
        copy[challengeId] = file;
      } else {
        delete copy[challengeId];
      }
      return copy;
    });
  }

  hasFile(challengeId: number): boolean {
    return !!this.fileMap()[challengeId];
  }

  fileError(challengeId: number): string | null {
    return this.fileErrors()[challengeId] ?? null;
  }

  getFile(challengeId: number): File | null {
    return this.fileMap()[challengeId] ?? null;
  }

  startAndDownload(c: Challenge): void {
    const msg = `Al iniciar el reto "${this.trackLabel(c)} - ${this.levelLabel(c)}" se descargará la carpeta de código y comenzará a correr tu tiempo de ${formatMinutes(c.durationMinutes)}. ¿Deseas continuar?`;
    if (!confirm(msg)) {
      return;
    }

    this.busyId.set(c.id);
    this.error.set('');
    this.api.start(c.id).subscribe({
      next: (started) => {
        this.replace(started);
        this.busyId.set(null);
        this.download(started);
      },
      error: async (e) => {
        this.error.set(await errorMessage(e));
        this.busyId.set(null);
      },
    });
  }

  download(c: Challenge): void {
    this.error.set('');
    this.api.downloadTemplate(c.id).subscribe({
      next: (resp) => saveDownload(resp, `reto-${c.track.toLowerCase()}-${c.level.toLowerCase()}.zip`),
      error: async (e) => this.error.set(await errorMessage(e)),
    });
  }

  submit(c: Challenge): void {
    const file = this.getFile(c.id);
    if (!file || this.fileError(c.id)) return;

    const msg = `Vas a entregar tu solución para "${this.trackLabel(c)} - ${this.levelLabel(c)}". La entrega es definitiva. ¿Deseas continuar?`;
    if (!confirm(msg)) return;

    this.busyId.set(c.id);
    this.error.set('');
    this.api.submit(c.id, file).subscribe({
      next: (done) => {
        this.replace(done);
        this.fileMap.update((map) => {
          const copy = { ...map };
          delete copy[c.id];
          return copy;
        });
        this.busyId.set(null);
        this.info.set(`¡Entrega recibida para ${this.trackLabel(c)}! Gestión Humana ha sido notificada.`);
      },
      error: async (e) => {
        this.error.set(await errorMessage(e));
        this.busyId.set(null);
        this.load(true);
      },
    });
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.api.challenges().subscribe({
      next: (list) => {
        this.all.set(list);
        this.loading.set(false);
      },
      error: async (e) => {
        this.error.set(await errorMessage(e));
        this.loading.set(false);
      },
    });
  }

  private replace(updated: Challenge): void {
    this.all.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
  }

  private tick(): void {
    this.now.set(Date.now());

    // Si algún reto en progreso llega a 0, sincronizamos con el backend
    const inProgress = this.all().filter((c) => c.status === 'IN_PROGRESS');
    for (const c of inProgress) {
      if (this.remainingFor(c) === 0) {
        this.load(true);
        break;
      }
    }

    // Resincronización periódica cada 60s
    if (++this.ticks % 60 === 0) {
      this.load(true);
    }
  }
}
