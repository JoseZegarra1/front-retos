import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { PasswordStrengthMeter } from '../../core/password-strength';
import {
  PASSWORD_MESSAGES,
  differentValidator,
  firstError,
  matchValidator,
  passwordPolicyValidator,
} from '../../core/validators';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, PasswordStrengthMeter],
  template: `
    <main class="auth-page">
      <section class="auth-panel">
        <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <header class="auth-head">
            <span class="auth-mark" aria-hidden="true"></span>
            <h1>Cambiar contraseña</h1>
          </header>
          @if (auth.user()?.mustChangePassword) {
            <p class="alert info">Tu contraseña es temporal. Define una nueva para continuar.</p>
          }
          <label>
            Contraseña actual
            <input
              formControlName="current"
              [type]="show() ? 'text' : 'password'"
              autocomplete="current-password"
              [class.is-invalid]="msg('current')"
            />
            @if (msg('current'); as m) {
              <span class="field-error">{{ m }}</span>
            }
          </label>
          <label>
            Nueva contraseña
            <div class="password-input-wrap">
              <input
                formControlName="next"
                [type]="show() ? 'text' : 'password'"
                autocomplete="new-password"
                [class.is-invalid]="msg('next')"
              />
              <button
                type="button"
                class="password-toggle-btn"
                (click)="show.set(!show())"
                [title]="show() ? 'Ocultar contraseñas' : 'Ver contraseñas'"
              >
                {{ show() ? '👁' : '👁' }}
              </button>
            </div>
            <app-password-strength [value]="nextValue()" />
            @if (msg('next'); as m) {
              <span class="field-error">{{ m }}</span>
            } @else {
              <span class="field-hint">Mínimo 8 caracteres, con mayúscula, minúscula, número y carácter especial.</span>
            }
          </label>
          <label>
            Repite la nueva contraseña
            <input
              formControlName="again"
              [type]="show() ? 'text' : 'password'"
              autocomplete="new-password"
              [class.is-invalid]="msg('again')"
            />
            @if (msg('again'); as m) {
              <span class="field-error">{{ m }}</span>
            }
          </label>

          @if (error()) {
            <p class="alert error">{{ error() }}</p>
          }
          <button class="btn primary block auth-submit" type="submit" [disabled]="loading() || form.invalid">
            {{ loading() ? 'Guardando…' : 'Guardar' }}
          </button>
          <button class="btn link" type="button" (click)="auth.logout()">Cerrar sesión</button>
        </form>
      </section>
    </main>
  `,
})
export class ChangePassword {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly show = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      current: ['', [Validators.required]],
      next: ['', [Validators.required, passwordPolicyValidator]],
      again: ['', [Validators.required]],
    },
    { validators: [differentValidator('next', 'current'), matchValidator('again', 'next')] },
  );

  readonly nextValue = toSignal(this.form.controls.next.valueChanges, { initialValue: '' });

  private readonly messages: Record<string, Record<string, string>> = {
    current: { required: 'Ingresa tu contraseña actual.' },
    next: {
      required: 'Ingresa la nueva contraseña.',
      ...PASSWORD_MESSAGES,
      sameAsCurrent: 'La nueva contraseña debe ser distinta de la actual.',
    },
    again: { required: 'Repite la nueva contraseña.', mismatch: 'Las contraseñas nuevas no coinciden.' },
  };

  msg(field: 'current' | 'next' | 'again'): string | null {
    return firstError(this.form.get(field), this.messages[field]);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { current, next } = this.form.getRawValue();
    this.loading.set(true);
    this.error.set('');
    this.auth.changePassword(current, next).subscribe({
      next: () => this.router.navigateByUrl(this.auth.homeUrl()),
      error: async (e) => {
        this.error.set(await errorMessage(e));
        this.loading.set(false);
      },
    });
  }
}
