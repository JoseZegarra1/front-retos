import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ROLE_LABEL, Role, User } from '../../core/models';
import { PasswordStrengthMeter } from '../../core/password-strength';
import {
  PASSWORD_MESSAGES,
  USERNAME_RE,
  firstError,
  fullNameValidator,
  passwordPolicyValidator,
  strictEmailValidator,
} from '../../core/validators';

@Component({
  selector: 'app-users',
  imports: [ReactiveFormsModule, PasswordStrengthMeter],
  template: `
    <section class="page">
      <h1>Usuarios</h1>

      @if (error()) {
        <p class="alert error">{{ error() }}</p>
      }
      @if (created()) {
        <div class="alert ok">
          <div>
            Usuario <strong>{{ created()!.username }}</strong> creado exitosamente.
            @if (created()!.password) {
              <span>
                Contraseña temporal: <code>{{ created()!.password }}</code>
                <button
                  type="button"
                  class="copy-btn"
                  (click)="copyPassword(created()!.password!)"
                  [title]="copied() ? 'Copiado al portapapeles' : 'Copiar al portapapeles'"
                >
                  {{ copied() ? '✓ Copiado' : 'Copiar clave' }}
                </button>
                — entrégasela al candidato; se le pedirá cambiarla al ingresar.
              </span>
            } @else {
              Se usó la contraseña indicada; se le pedirá cambiarla al ingresar.
            }
          </div>
        </div>
      }

      <form class="card" [formGroup]="userForm" (ngSubmit)="create()" novalidate>
        <h2>Crear usuario</h2>
        <div class="grid">
          <!-- Campo: Usuario -->
          <label>
            Usuario *
            <input
              formControlName="username"
              placeholder="ej. juan.perez"
              [class.is-invalid]="isInvalid('username')"
              autocomplete="off"
            />
            @if (msg('username'); as m) {
              <span class="field-error">{{ m }}</span>
            } @else {
              <span class="field-hint">3 a 60 caracteres: letras, números, '.', '-' y '_'</span>
            }
          </label>

          <!-- Campo: Nombre completo -->
          <label>
            Nombre completo *
            <input
              formControlName="fullName"
              placeholder="ej. Juan Pérez Gonzales"
              [class.is-invalid]="isInvalid('fullName')"
            />
            @if (msg('fullName'); as m) {
              <span class="field-error">{{ m }}</span>
            } @else {
              <span class="field-hint">Nombres y apellidos (solo letras, espacios, ' y -)</span>
            }
          </label>

          <!-- Campo: Correo -->
          <label>
            Correo electrónico {{ emailRequired() ? '*' : '' }}
            <input
              type="email"
              formControlName="email"
              placeholder="ej. juan.perez@empresa.com"
              [class.is-invalid]="isInvalid('email')"
              autocomplete="off"
            />
            @if (msg('email'); as m) {
              <span class="field-error">{{ m }}</span>
            } @else if (emailRequired()) {
              <span class="field-hint">Obligatorio para GHD y Administrador.</span>
            } @else {
              <span class="field-hint">Opcional para candidatos.</span>
            }
          </label>

          <!-- Campo: Contraseña (opcional) -->
          <label>
            Contraseña (opcional)
            <div class="password-input-wrap">
              <input
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                placeholder="Vacío = se autogenera"
                [class.is-invalid]="isInvalid('password')"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="password-toggle-btn"
                (click)="togglePassword()"
                [title]="showPassword() ? 'Ocultar contraseña' : 'Ver contraseña'"
              >
                {{ showPassword() ? '🙈' : '👁' }}
              </button>
            </div>
            <app-password-strength [value]="passwordValue()" />
            @if (msg('password'); as m) {
              <span class="field-error">{{ m }}</span>
            } @else {
              <span class="field-hint">Si la escribes: 8+ caracteres, mayúscula, minúscula, número y especial</span>
            }
          </label>

          <!-- Campo: Rol (solo ADMIN) -->
          @if (isAdmin()) {
            <label>
              Rol *
              <select formControlName="role">
                @for (r of roles; track r) {
                  <option [ngValue]="r">{{ roleLabel(r) }}</option>
                }
              </select>
              <span class="field-hint">Nivel de permisos dentro del sistema</span>
            </label>
          }
        </div>

        <div class="row">
          <button
            class="btn primary"
            type="submit"
            [disabled]="busy() || userForm.invalid"
          >
            {{ busy() ? 'Creando...' : 'Crear usuario' }}
          </button>
          <button
            type="button"
            class="btn"
            (click)="resetForm()"
            [disabled]="busy() || userForm.pristine"
          >
            Limpiar
          </button>
        </div>
      </form>

      @if (canTestMail()) {
        <form class="card" [formGroup]="mailForm" (ngSubmit)="sendTestMail()" novalidate>
          <h2>Probar correo (SMTP)</h2>
          <p class="muted small">
            Envía un correo de prueba con la configuración SMTP del servidor para verificar que GHD recibirá los
            resúmenes.
          </p>
          <div class="row">
            <label style="flex: 1; min-width: 240px;">
              Destinatario
              <input
                type="email"
                formControlName="to"
                placeholder="ej. ghd@empresa.com"
                [class.is-invalid]="mailMsg()"
              />
              @if (mailMsg(); as m) {
                <span class="field-error">{{ m }}</span>
              }
            </label>
            <button class="btn" type="submit" [disabled]="mailBusy() || mailForm.invalid">
              {{ mailBusy() ? 'Enviando…' : 'Enviar prueba' }}
            </button>
          </div>
          @if (mailResult(); as r) {
            <p class="alert" [class.ok]="r.ok" [class.error]="!r.ok">{{ r.text }}</p>
          }
        </form>
      }

      <div class="table-wrap card">
        <div class="row between" style="padding: 12px 14px 4px;">
          <h2>Listado de usuarios ({{ filteredUsers().length }})</h2>
          <input
            type="text"
            placeholder="Buscar por usuario, nombre o correo..."
            [value]="filterText()"
            (input)="filterText.set($any($event.target).value)"
            style="max-width: 320px;"
          />
        </div>
        <table>
          <thead>
            <tr><th>Usuario</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            @for (u of filteredUsers(); track u.id) {
              <tr>
                <td><strong>{{ u.username }}</strong></td>
                <td>{{ u.fullName }}</td>
                <td>{{ u.email ?? '—' }}</td>
                <td><span class="badge">{{ roleLabel(u.role) }}</span></td>
                <td>
                  <span class="badge" [class.s-SUBMITTED]="u.active" [class.s-EXPIRED]="!u.active">
                    {{ u.active ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="actions">
                  @if (u.id !== me()?.id) {
                    <button class="btn small" (click)="toggle(u)">
                      {{ u.active ? 'Desactivar' : 'Activar' }}
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="muted center">Sin usuarios que coincidan con la búsqueda.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class Users implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly roles: Role[] = ['USER', 'GHD', 'ADMIN'];
  readonly users = signal<User[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly submitted = signal(false);
  readonly showPassword = signal(false);
  readonly copied = signal(false);
  readonly filterText = signal('');

  readonly created = signal<{ username: string; password: string | null } | null>(null);
  readonly me = this.auth.user;
  readonly isAdmin = computed(() => this.auth.hasRole('ADMIN'));
  readonly canTestMail = computed(() => this.auth.hasRole('GHD', 'ADMIN'));

  private readonly emailValidators = [strictEmailValidator, Validators.maxLength(150)];

  readonly userForm = this.fb.group({
    username: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(60),
        Validators.pattern(USERNAME_RE),
      ],
    ],
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100), fullNameValidator]],
    email: ['', this.emailValidators],
    password: ['', [passwordPolicyValidator]],
    role: ['USER' as Role, [Validators.required]],
  });

  readonly roleValue = toSignal(this.userForm.controls.role.valueChanges, { initialValue: 'USER' as Role | null });
  readonly passwordValue = toSignal(this.userForm.controls.password.valueChanges, { initialValue: '' });
  readonly emailRequired = computed(() => this.isAdmin() && this.roleValue() !== 'USER');

  private readonly messages: Record<string, Record<string, string>> = {
    username: {
      required: 'El nombre de usuario es obligatorio.',
      minlength: 'Debe tener al menos 3 caracteres.',
      maxlength: 'No puede exceder 60 caracteres.',
      pattern: "Solo letras, números, '.', '-' y '_' (sin espacios ni tildes).",
    },
    fullName: {
      required: 'El nombre completo es obligatorio.',
      edgeSpaces: 'No puede empezar ni terminar con espacios.',
      doubleSpaces: 'No puede tener espacios dobles.',
      fullNameChars: "Solo letras, espacios, apóstrofo (') y guion (-). Sin números ni símbolos.",
      minlength: 'Debe tener al menos 3 caracteres.',
      maxlength: 'No puede exceder 100 caracteres.',
    },
    email: {
      required: 'El correo es obligatorio para GHD y Administrador.',
      strictEmail: 'Ingresa un correo válido, por ejemplo nombre@empresa.com.',
      maxlength: 'No puede exceder 150 caracteres.',
    },
    password: PASSWORD_MESSAGES,
  };

  readonly mailForm = this.fb.nonNullable.group({
    to: ['', [Validators.required, strictEmailValidator, Validators.maxLength(150)]],
  });
  readonly mailBusy = signal(false);
  readonly mailResult = signal<{ ok: boolean; text: string } | null>(null);

  constructor() {
    // El correo es obligatorio para GHD y ADMIN, opcional para USER
    this.userForm.controls.role.valueChanges.pipe(takeUntilDestroyed()).subscribe((role) => {
      const email = this.userForm.controls.email;
      email.setValidators(role && role !== 'USER' ? [Validators.required, ...this.emailValidators] : this.emailValidators);
      email.updateValueAndValidity();
    });
  }

  readonly filteredUsers = computed(() => {
    const q = this.filterText().trim().toLowerCase();
    const list = this.users();
    if (!q) return list;
    return list.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)),
    );
  });

  roleLabel = (r: Role) => ROLE_LABEL[r];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.users().subscribe({
      next: (u) => this.users.set(u),
      error: async (e) => this.error.set(await errorMessage(e)),
    });
  }

  isInvalid(field: string): boolean {
    const ctrl = this.userForm.get(field);
    if (!ctrl) return false;
    return ctrl.invalid && (ctrl.touched || ctrl.dirty || this.submitted());
  }

  msg(field: string): string | null {
    return firstError(this.userForm.get(field), this.messages[field], this.submitted());
  }

  mailMsg(): string | null {
    return firstError(this.mailForm.controls.to, {
      required: 'Indica el correo de destino.',
      strictEmail: 'Ingresa un correo válido.',
      maxlength: 'No puede exceder 150 caracteres.',
    });
  }

  sendTestMail(): void {
    if (this.mailForm.invalid) {
      this.mailForm.markAllAsTouched();
      return;
    }
    this.mailBusy.set(true);
    this.mailResult.set(null);
    this.api.testNotification(this.mailForm.getRawValue().to.trim().toLowerCase()).subscribe({
      next: (r) => {
        this.mailResult.set({ ok: true, text: r.message });
        this.mailBusy.set(false);
      },
      error: async (e) => {
        this.mailResult.set({ ok: false, text: await errorMessage(e) });
        this.mailBusy.set(false);
      },
    });
  }

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  copyPassword(pwd: string): void {
    navigator.clipboard.writeText(pwd).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    });
  }

  resetForm(): void {
    this.submitted.set(false);
    this.userForm.reset({
      username: '',
      fullName: '',
      email: '',
      password: '',
      role: 'USER',
    });
  }

  create(): void {
    this.submitted.set(true);
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    this.error.set('');
    this.created.set(null);

    const val = this.userForm.value;
    this.api
      .createUser({
        username: (val.username ?? '').trim(),
        fullName: (val.fullName ?? '').trim(),
        email: (val.email ?? '').trim().toLowerCase() || null,
        password: val.password || null,
        role: this.isAdmin() ? (val.role as Role) : 'USER',
      })
      .subscribe({
        next: (res) => {
          this.created.set({ username: res.user.username, password: res.temporaryPassword });
          this.resetForm();
          this.busy.set(false);
          this.load();
        },
        error: async (e) => {
          this.error.set(await errorMessage(e));
          this.busy.set(false);
        },
      });
  }

  toggle(u: User): void {
    this.api.setUserActive(u.id, !u.active).subscribe({
      next: () => this.load(),
      error: async (e) => this.error.set(await errorMessage(e)),
    });
  }
}
