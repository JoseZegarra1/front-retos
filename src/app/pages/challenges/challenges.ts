import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ApiService, errorMessage, saveDownload } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  Challenge,
  GradeResult,
  LEVEL_LABEL,
  Level,
  STATUS_LABEL,
  TRACK_LABEL,
  Track,
  User,
} from '../../core/models';
import { firstError, formatMinutes } from '../../core/validators';

interface CandidateGroup {
  candidateId: number;
  name: string;
  username: string;
  track: Track;
  items: Challenge[];
}

const COMMENT_MAX = 2000;

@Component({
  selector: 'app-challenges',
  imports: [FormsModule, ReactiveFormsModule, DatePipe],
  template: `
    <section class="page">
      <div class="row between">
        <div>
          <h1>Retos técnicos</h1>
          <p class="muted">Asigna uno o varios niveles del mismo módulo a cada candidato y califica sus entregas.</p>
        </div>
        <button class="btn" (click)="load()" [disabled]="loading()">Actualizar</button>
      </div>

      @if (error()) {
        <p class="alert error">{{ error() }}</p>
      }
      @if (info()) {
        <p class="alert ok">{{ info() }}</p>
      }

      <form class="card" [formGroup]="assignForm" (ngSubmit)="assign()" novalidate>
        <h2>Asignar retos</h2>
        <div class="grid">
          <label>
            Candidato *
            <select formControlName="candidateId" [class.is-invalid]="msg('candidateId')">
              <option [ngValue]="null" disabled>Selecciona un candidato…</option>
              @for (u of candidates(); track u.id) {
                <option [ngValue]="u.id">{{ u.fullName }} ({{ u.username }})</option>
              }
            </select>
            @if (msg('candidateId'); as m) {
              <span class="field-error">{{ m }}</span>
            }
          </label>

          <label>
            Módulo *
            <select formControlName="track" [class.is-invalid]="trackConflict()">
              @for (t of trackKeys(); track t) {
                <option [ngValue]="t">{{ trackLabel(t) }}</option>
              }
            </select>
            @if (trackConflict()) {
              <span class="field-error">
                Este candidato ya tiene retos de {{ trackLabel(candidateTrack()!) }}; solo puede recibir ese módulo.
              </span>
            } @else if (candidateTrack()) {
              <span class="field-hint">El candidato tiene retos de {{ trackLabel(candidateTrack()!) }}.</span>
            }
          </label>

          <label>
            Duración (minutos) *
            <input
              type="number"
              formControlName="durationMinutes"
              [min]="settings().minDurationMinutes"
              [max]="settings().maxDurationMinutes"
              step="5"
              [class.is-invalid]="msg('durationMinutes')"
            />
            @if (msg('durationMinutes'); as m) {
              <span class="field-error">{{ m }}</span>
            } @else {
              <span class="field-hint">
                {{ formatMinutes(assignForm.controls.durationMinutes.value ?? 0) }} por reto.
                Entre {{ settings().minDurationMinutes }} y {{ settings().maxDurationMinutes }} min.
              </span>
            }
          </label>
        </div>

        <fieldset class="levels-box" [class.is-invalid]="msg('levels')">
          <legend>Niveles * <span class="muted small">(puedes elegir varios)</span></legend>
          <div class="row">
            @for (l of levels(); track l) {
              <label class="inline check" [class.disabled]="isPendingLevel(l)">
                <input
                  type="checkbox"
                  [checked]="selectedLevels().includes(l)"
                  [disabled]="isPendingLevel(l) || trackConflict()"
                  (change)="toggleLevel(l, $any($event.target).checked)"
                />
                {{ levelLabel(l) }}
                @if (isPendingLevel(l)) {
                  <span class="muted small">(ya pendiente o en curso)</span>
                }
              </label>
            }
          </div>
          @if (msg('levels'); as m) {
            <span class="field-error">{{ m }}</span>
          }
        </fieldset>

        @if (selectedCandidate()) {
          <div class="candidate-preview">
            <strong>Retos de {{ selectedCandidate()!.fullName }} ({{ candidateChallenges().length }})</strong>
            @if (candidateChallenges().length > 0) {
              <div class="badge-list">
                @for (c of candidateChallenges(); track c.id) {
                  <span class="badge" [class]="'badge s-' + c.status">
                    {{ trackLabel(c.track) }} {{ levelLabel(c.level) }} ({{ statusLabel(c) }})
                  </span>
                }
              </div>
            } @else {
              <p class="muted small">Este candidato no tiene ningún reto asignado aún.</p>
            }
          </div>
        }

        <div class="row">
          <button class="btn primary" type="submit" [disabled]="busy() || assignForm.invalid || trackConflict()">
            @if (busy()) {
              Asignando…
            } @else {
              Asignar {{ selectedLevels().length > 1 ? selectedLevels().length + ' retos' : 'reto' }}
            }
          </button>
        </div>

        @if (candidates().length === 0 && !loading()) {
          <p class="muted small">No hay usuarios activos con rol Usuario. Créalos primero en la sección Usuarios.</p>
        }
      </form>

      <div class="table-wrap card">
        <div class="row between" style="padding: 12px 14px 4px;">
          <h2>Retos por candidato ({{ filteredCount() }})</h2>
          <div class="filter-row">
            <select [ngModel]="filterCandidate()" (ngModelChange)="filterCandidate.set($event)">
              <option [ngValue]="null">Todos los candidatos</option>
              @for (g of allGroups(); track g.candidateId) {
                <option [ngValue]="g.candidateId">{{ g.name }} ({{ g.items.length }})</option>
              }
            </select>
            <input
              type="text"
              placeholder="Buscar candidato, reto o estado…"
              [value]="filterText()"
              (input)="filterText.set($any($event.target).value)"
              style="max-width: 240px;"
            />
            <select [ngModel]="filterStatus()" (ngModelChange)="filterStatus.set($event)">
              <option value="ALL">Todos los estados</option>
              <option value="ASSIGNED">Asignados</option>
              <option value="IN_PROGRESS">En curso</option>
              <option value="SUBMITTED">Entregados</option>
              <option value="GRADED">Calificados</option>
              <option value="EXPIRED">Vencidos</option>
            </select>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Reto</th><th>Estado</th><th>Duración</th><th>Inicio</th><th>Límite / Entrega</th><th>Resultado</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (g of groups(); track g.candidateId) {
              <tr class="group-row">
                <td colspan="7">
                  <strong>{{ g.name }}</strong>
                  <span class="muted small">{{ g.username }} · {{ trackLabel(g.track) }} · {{ g.items.length }} reto(s)</span>
                </td>
              </tr>
              @for (c of g.items; track c.id) {
                <tr>
                  <td>{{ trackLabel(c.track) }} · {{ levelLabel(c.level) }}</td>
                  <td><span class="badge" [class]="'badge s-' + c.status">{{ statusLabel(c) }}</span></td>
                  <td>{{ formatMinutes(c.durationMinutes) }}</td>
                  <td>{{ c.startedAt ? (c.startedAt | date: 'dd/MM HH:mm') : '—' }}</td>
                  <td>
                    @if (c.submittedAt) {
                      Entregó {{ c.submittedAt | date: 'dd/MM HH:mm' }}
                    } @else if (c.deadlineAt) {
                      Límite {{ c.deadlineAt | date: 'dd/MM HH:mm' }}
                    } @else { — }
                  </td>
                  <td>
                    @if (c.result) {
                      <span class="badge" [class]="'badge r-' + c.result">{{ c.result === 'APTO' ? 'APTO' : 'NO APTO' }}</span>
                    } @else { — }
                  </td>
                  <td class="actions">
                    @if (c.status === 'ASSIGNED' || c.status === 'IN_PROGRESS') {
                      <button class="btn small" (click)="openDuration(c)">Cambiar duración</button>
                    }
                    @if (c.hasSubmission) {
                      <button class="btn small" (click)="downloadSubmission(c)">Descargar entrega</button>
                    }
                    @if (canGrade() && (c.status === 'SUBMITTED' || c.status === 'EXPIRED' || c.status === 'GRADED')) {
                      <button class="btn small primary" (click)="openGrade(c)">Calificar</button>
                    }
                  </td>
                </tr>
                @if (durationId() === c.id) {
                  <tr class="grade-row">
                    <td colspan="7">
                      <form class="grade-box" [formGroup]="durationForm" (ngSubmit)="saveDuration(c)" novalidate>
                        <strong>Duración de {{ trackLabel(c.track) }} · {{ levelLabel(c.level) }} ({{ c.candidateName }})</strong>
                        <label>
                          Nueva duración (minutos)
                          <input
                            type="number"
                            formControlName="minutes"
                            [min]="settings().minDurationMinutes"
                            [max]="settings().maxDurationMinutes"
                            step="5"
                            [class.is-invalid]="durationMsg(c)"
                          />
                          @if (durationMsg(c); as m) {
                            <span class="field-error">{{ m }}</span>
                          } @else if (c.status === 'IN_PROGRESS' && newDeadline(c); as d) {
                            <span class="field-hint">Nuevo límite: {{ d | date: 'dd/MM/yyyy HH:mm' }}</span>
                          } @else {
                            <span class="field-hint">Aún no inicia: el reloj arrancará con la nueva duración.</span>
                          }
                        </label>
                        <div class="row">
                          <button class="btn primary" type="submit" [disabled]="busy() || !!durationMsg(c, true)">
                            Guardar duración
                          </button>
                          <button class="btn" type="button" (click)="durationId.set(null)">Cancelar</button>
                        </div>
                      </form>
                    </td>
                  </tr>
                }
                @if (gradingId() === c.id) {
                  <tr class="grade-row">
                    <td colspan="7">
                      <form class="grade-box" [formGroup]="gradeForm" (ngSubmit)="saveGrade(c)" novalidate>
                        <strong>Calificar a {{ c.candidateName }} ({{ trackLabel(c.track) }} - {{ levelLabel(c.level) }})</strong>
                        <div class="row">
                          <label class="inline">
                            <input type="radio" formControlName="result" value="APTO" /> APTO
                          </label>
                          <label class="inline">
                            <input type="radio" formControlName="result" value="NO_APTO" /> NO APTO
                          </label>
                        </div>
                        <label>
                          Comentario (opcional)
                          <textarea
                            rows="3"
                            formControlName="comment"
                            [class.is-invalid]="commentLength() > commentMax"
                          ></textarea>
                          <span class="counter" [class.over]="commentLength() > commentMax">
                            {{ commentLength() }} / {{ commentMax }}
                          </span>
                          @if (commentLength() > commentMax) {
                            <span class="field-error">El comentario no puede exceder {{ commentMax }} caracteres.</span>
                          }
                        </label>
                        <div class="row">
                          <button class="btn primary" type="submit" [disabled]="busy() || gradeForm.invalid">
                            Guardar calificación
                          </button>
                          <button class="btn" type="button" (click)="gradingId.set(null)">Cancelar</button>
                        </div>
                      </form>
                    </td>
                  </tr>
                }
              }
            } @empty {
              <tr><td colspan="7" class="muted center">Sin retos registrados que coincidan con el filtro.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class Challenges implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly info = signal('');

  readonly users = signal<User[]>([]);
  readonly challenges = signal<Challenge[]>([]);
  readonly tracks = signal<Record<string, Level[]>>({});
  readonly settings = this.api.settings();

  readonly gradingId = signal<number | null>(null);
  readonly durationId = signal<number | null>(null);

  readonly filterText = signal('');
  readonly filterStatus = signal('ALL');
  readonly filterCandidate = signal<number | null>(null);

  readonly commentMax = COMMENT_MAX;
  readonly formatMinutes = formatMinutes;

  /** Duración dentro de los límites del backend (se leen de /api/settings). */
  private readonly durationRange: ValidatorFn = (c) => {
    const v = c.value;
    if (v === null || v === '' || v === undefined) return null;
    const s = this.settings();
    if (!Number.isInteger(Number(v))) return { integer: true };
    if (v < s.minDurationMinutes) return { min: true };
    if (v > s.maxDurationMinutes) return { max: true };
    return null;
  };

  /** Los niveles marcados deben existir en el módulo elegido (Data no admite Master). */
  private readonly levelsMatchTrack: ValidatorFn = (group) => {
    const track = group.get('track')?.value as Track;
    const levels = (group.get('levels')?.value ?? []) as Level[];
    const allowed = this.tracks()[track] ?? [];
    const bad = allowed.length > 0 && levels.some((l) => !allowed.includes(l));
    const ctrl = group.get('levels');
    if (ctrl) {
      const errors = { ...(ctrl.errors ?? {}) };
      if (bad) errors['levelTrack'] = true;
      else delete errors['levelTrack'];
      ctrl.setErrors(Object.keys(errors).length ? errors : null);
    }
    return null;
  };

  readonly assignForm = this.fb.group(
    {
      candidateId: [null as number | null, Validators.required],
      track: ['DEVOPS' as Track, Validators.required],
      levels: [[] as Level[], Validators.required],
      durationMinutes: [180 as number | null, [Validators.required, this.durationRange]],
    },
    { validators: this.levelsMatchTrack },
  );

  readonly durationForm = this.fb.group({
    minutes: [180 as number | null, [Validators.required, this.durationRange]],
  });

  readonly gradeForm = this.fb.nonNullable.group({
    result: ['APTO' as GradeResult, Validators.required],
    comment: ['', Validators.maxLength(COMMENT_MAX)],
  });

  private readonly formValue = toSignal(this.assignForm.valueChanges, { initialValue: this.assignForm.value });
  private readonly commentValue = toSignal(this.gradeForm.controls.comment.valueChanges, { initialValue: '' });
  readonly commentLength = computed(() => (this.commentValue() ?? '').length);

  private readonly messages: Record<string, Record<string, string>> = {
    candidateId: { required: 'Selecciona un candidato.' },
    levels: {
      required: 'Selecciona al menos un nivel.',
      levelTrack: 'Hay niveles que no corresponden al módulo elegido.',
    },
    durationMinutes: {
      required: 'Indica la duración en minutos.',
      integer: 'Usa un número entero de minutos.',
      min: 'La duración es menor que el mínimo permitido.',
      max: 'La duración supera el máximo permitido.',
    },
  };

  readonly canGrade = computed(() => this.auth.hasRole('GHD', 'ADMIN'));
  readonly candidates = computed(() => this.users().filter((u) => u.role === 'USER' && u.active));
  readonly trackKeys = computed(() => Object.keys(this.tracks()) as Track[]);
  readonly track = computed(() => (this.formValue().track ?? 'DEVOPS') as Track);
  readonly levels = computed(() => this.tracks()[this.track()] ?? []);
  readonly selectedLevels = computed(() => (this.formValue().levels ?? []) as Level[]);
  readonly candidateId = computed(() => this.formValue().candidateId ?? null);

  readonly selectedCandidate = computed(() => {
    const id = this.candidateId();
    if (id === null) return null;
    return this.users().find((u) => u.id === id) ?? null;
  });

  readonly candidateChallenges = computed(() => {
    const id = this.candidateId();
    if (id === null) return [];
    return this.challenges().filter((c) => c.candidateId === id);
  });

  /** Módulo al que ya pertenece el candidato (todos sus retos son del mismo). */
  readonly candidateTrack = computed<Track | null>(() => this.candidateChallenges()[0]?.track ?? null);
  readonly trackConflict = computed(() => {
    const t = this.candidateTrack();
    return t !== null && t !== this.track();
  });

  readonly pendingLevels = computed(
    () =>
      new Set(
        this.candidateChallenges()
          .filter((c) => c.track === this.track() && (c.status === 'ASSIGNED' || c.status === 'IN_PROGRESS'))
          .map((c) => c.level),
      ),
  );

  private readonly filtered = computed(() => {
    const q = this.filterText().trim().toLowerCase();
    const st = this.filterStatus();
    const cand = this.filterCandidate();
    return this.challenges().filter(
      (c) =>
        (st === 'ALL' || c.status === st) &&
        (cand === null || c.candidateId === cand) &&
        (!q ||
          c.candidateName.toLowerCase().includes(q) ||
          c.candidateUsername.toLowerCase().includes(q) ||
          this.trackLabel(c.track).toLowerCase().includes(q) ||
          this.levelLabel(c.level).toLowerCase().includes(q) ||
          this.statusLabel(c).toLowerCase().includes(q)),
    );
  });

  readonly allGroups = computed(() => groupByCandidate(this.challenges()));
  readonly groups = computed(() => groupByCandidate(this.filtered()));
  readonly filteredCount = computed(() => this.filtered().length);

  trackLabel = (t: Track) => TRACK_LABEL[t];
  levelLabel = (l: Level) => LEVEL_LABEL[l];
  statusLabel = (c: Challenge) => STATUS_LABEL[c.status];

  constructor() {
    // Al elegir candidato con retos previos, se fija su módulo y se limpian los niveles
    this.assignForm.controls.candidateId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const existing = this.challenges().find((c) => c.candidateId === id);
      if (existing && existing.track !== this.assignForm.controls.track.value) {
        this.assignForm.controls.track.setValue(existing.track);
      }
      this.assignForm.controls.levels.setValue([]);
    });
    // Al cambiar de módulo se quitan los niveles que no existen en él
    this.assignForm.controls.track.valueChanges.pipe(takeUntilDestroyed()).subscribe((t) => {
      const allowed = this.tracks()[t ?? ''] ?? [];
      const current = this.assignForm.controls.levels.value ?? [];
      this.assignForm.controls.levels.setValue(current.filter((l) => allowed.includes(l)));
    });
  }

  ngOnInit(): void {
    this.api.tracks().subscribe({
      next: (t) => {
        this.tracks.set(t);
        this.assignForm.updateValueAndValidity();
      },
      error: async (e) => this.error.set(await errorMessage(e)),
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.users().subscribe({
      next: (u) => this.users.set(u),
      error: async (e) => this.error.set(await errorMessage(e)),
    });
    this.api.challenges().subscribe({
      next: (c) => {
        this.challenges.set(c);
        this.loading.set(false);
      },
      error: async (e) => {
        this.error.set(await errorMessage(e));
        this.loading.set(false);
      },
    });
  }

  msg(field: string): string | null {
    return firstError(this.assignForm.get(field), this.messages[field]);
  }

  isPendingLevel(l: Level): boolean {
    return this.pendingLevels().has(l);
  }

  toggleLevel(l: Level, checked: boolean): void {
    const ctrl = this.assignForm.controls.levels;
    const current = ctrl.value ?? [];
    const next = checked ? [...current, l] : current.filter((x) => x !== l);
    // Se mantiene el orden del catálogo (Principiante, Competente, …)
    ctrl.setValue(this.levels().filter((x) => next.includes(x)));
    ctrl.markAsTouched();
  }

  assign(): void {
    if (this.assignForm.invalid || this.trackConflict()) {
      this.assignForm.markAllAsTouched();
      return;
    }
    const v = this.assignForm.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.info.set('');
    this.api.assign(v.candidateId!, v.track!, v.levels!, Number(v.durationMinutes)).subscribe({
      next: (created) => {
        const names = created.map((c) => this.levelLabel(c.level)).join(', ');
        this.info.set(
          `Asignado(s) a ${created[0]?.candidateName}: ${this.trackLabel(v.track!)} · ${names} (${formatMinutes(Number(v.durationMinutes))} cada uno).`,
        );
        this.assignForm.controls.levels.setValue([]);
        this.assignForm.controls.levels.markAsUntouched();
        this.busy.set(false);
        this.load();
      },
      error: async (e) => {
        this.error.set(await errorMessage(e));
        this.busy.set(false);
      },
    });
  }

  // ---- duración ----

  openDuration(c: Challenge): void {
    this.gradingId.set(null);
    this.durationId.set(c.id);
    this.durationForm.reset({ minutes: c.durationMinutes });
  }

  /** Límite que tendría el reto en curso con la duración escrita. */
  newDeadline(c: Challenge): Date | null {
    const minutes = Number(this.durationForm.controls.minutes.value);
    if (!c.startedAt || !minutes) return null;
    return new Date(new Date(c.startedAt).getTime() + minutes * 60_000);
  }

  durationMsg(c: Challenge, force = false): string | null {
    const ctrl = this.durationForm.controls.minutes;
    const base = firstError(ctrl, this.messages['durationMinutes'], force);
    if (base) return base;
    if (force && ctrl.invalid) return 'invalid';
    if (c.status === 'IN_PROGRESS') {
      const d = this.newDeadline(c);
      if (d && d.getTime() <= Date.now()) {
        const used = Math.floor((Date.now() - new Date(c.startedAt!).getTime()) / 60_000);
        return `Con esa duración el límite ya habría pasado: el candidato lleva ${used} min.`;
      }
    }
    return null;
  }

  saveDuration(c: Challenge): void {
    if (this.durationMsg(c, true)) {
      this.durationForm.markAllAsTouched();
      return;
    }
    const minutes = Number(this.durationForm.controls.minutes.value);
    this.busy.set(true);
    this.error.set('');
    this.api.updateDuration(c.id, minutes).subscribe({
      next: () => {
        this.durationId.set(null);
        this.busy.set(false);
        this.info.set(`Duración de ${c.candidateName} (${this.levelLabel(c.level)}) cambiada a ${formatMinutes(minutes)}.`);
        this.load();
      },
      error: async (e) => {
        this.error.set(await errorMessage(e));
        this.busy.set(false);
      },
    });
  }

  // ---- entrega y calificación ----

  downloadSubmission(c: Challenge): void {
    this.api.downloadSubmission(c.id).subscribe({
      next: (resp) => saveDownload(resp, `entrega-${c.id}.zip`),
      error: async (e) => this.error.set(await errorMessage(e)),
    });
  }

  openGrade(c: Challenge): void {
    this.durationId.set(null);
    this.gradingId.set(c.id);
    this.gradeForm.reset({ result: c.result ?? 'APTO', comment: c.gradeComment ?? '' });
  }

  saveGrade(c: Challenge): void {
    if (this.gradeForm.invalid) {
      this.gradeForm.markAllAsTouched();
      return;
    }
    const { result, comment } = this.gradeForm.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.api.grade(c.id, result, comment).subscribe({
      next: () => {
        this.gradingId.set(null);
        this.busy.set(false);
        this.info.set(`Calificación guardada para ${c.candidateName}.`);
        this.load();
      },
      error: async (e) => {
        this.error.set(await errorMessage(e));
        this.busy.set(false);
      },
    });
  }
}

/** Agrupa por candidato conservando el orden de llegada (más reciente primero). */
function groupByCandidate(list: Challenge[]): CandidateGroup[] {
  const map = new Map<number, CandidateGroup>();
  for (const c of list) {
    let g = map.get(c.candidateId);
    if (!g) {
      g = { candidateId: c.candidateId, name: c.candidateName, username: c.candidateUsername, track: c.track, items: [] };
      map.set(c.candidateId, g);
    }
    g.items.push(c);
  }
  return [...map.values()];
}
