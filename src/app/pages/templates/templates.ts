import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { LEVEL_LABEL, Level, TRACK_LABEL, Track } from '../../core/models';
import { formatBytes, zipFileError } from '../../core/validators';

interface Slot {
  track: Track;
  level: Level;
  key: string;
}

@Component({
  selector: 'app-templates',
  imports: [],
  template: `
    <section class="page">
      <h1>Carpetas de código de los retos</h1>
      <p class="muted">
        Sube un .zip por cada reto y nivel. Es lo que descargará el candidato al iniciar. Se guarda en el Storage Account en
        <code>plantillas/tipo/nivel.zip</code>. Solo archivos .zip, máximo {{ maxUpload() }}.
      </p>

      @if (error()) {
        <p class="alert error">{{ error() }}</p>
      }

      <div class="table-wrap card">
        <table>
          <thead>
            <tr><th>Reto</th><th>Nivel</th><th>Archivo .zip</th><th>Estado</th></tr>
          </thead>
          <tbody>
            @for (s of slots(); track s.key) {
              <tr>
                <td>{{ trackLabel(s.track) }}</td>
                <td>{{ levelLabel(s.level) }}</td>
                <td>
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    [class.is-invalid]="fileErrors()[s.key]"
                    (change)="onFile(s, $event)"
                  />
                  @if (fileErrors()[s.key]; as m) {
                    <span class="field-error">{{ m }}</span>
                  }
                </td>
                <td class="actions">
                  <button
                    class="btn small primary"
                    [disabled]="!files[s.key] || !!fileErrors()[s.key] || uploading() === s.key"
                    (click)="upload(s)"
                  >
                    {{ uploading() === s.key ? 'Subiendo…' : 'Subir' }}
                  </button>
                  @if (done()[s.key]) {
                    <span class="ok-text">✓ Cargado</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class Templates implements OnInit {
  private readonly api = inject(ApiService);

  readonly slots = signal<Slot[]>([]);
  readonly error = signal('');
  readonly uploading = signal<string | null>(null);
  readonly done = signal<Record<string, boolean>>({});
  readonly fileErrors = signal<Record<string, string | null>>({});
  private readonly settings = this.api.settings();
  readonly maxUpload = computed(() => formatBytes(this.settings().maxUploadBytes));
  files: Record<string, File | undefined> = {};

  trackLabel = (t: Track) => TRACK_LABEL[t];
  levelLabel = (l: Level) => LEVEL_LABEL[l];

  ngOnInit(): void {
    this.api.tracks().subscribe({
      next: (tracks) => {
        const slots: Slot[] = [];
        for (const t of Object.keys(tracks) as Track[]) {
          for (const l of tracks[t]) {
            slots.push({ track: t, level: l, key: `${t}/${l}` });
          }
        }
        this.slots.set(slots);
      },
      error: async (e) => this.error.set(await errorMessage(e)),
    });
  }

  onFile(slot: Slot, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.files[slot.key] = file;
    this.fileErrors.update((e) => ({
      ...e,
      [slot.key]: file ? zipFileError(file, this.settings().maxUploadBytes) : null,
    }));
    this.done.update((d) => ({ ...d, [slot.key]: false }));
  }

  upload(slot: Slot): void {
    const file = this.files[slot.key];
    if (!file || this.fileErrors()[slot.key]) return;
    this.uploading.set(slot.key);
    this.error.set('');
    this.api.uploadTemplate(slot.track, slot.level, file).subscribe({
      next: () => {
        this.uploading.set(null);
        this.done.update((d) => ({ ...d, [slot.key]: true }));
      },
      error: async (e) => {
        this.error.set(await errorMessage(e));
        this.uploading.set(null);
      },
    });
  }
}
