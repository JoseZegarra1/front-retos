import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { firstError } from '../../core/validators';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  styleUrl: './login.css',
  template: `
    <main class="auth-page login">
      <section class="auth-panel">
        <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <header class="auth-head">
            <span class="auth-mark" aria-hidden="true"></span>
            <h1>Retos técnicos</h1>
            <p class="muted">Ingresa con el usuario que te entregó Gestión Humana (GHD).</p>
          </header>

          <label>
            Usuario
            <input
              formControlName="username"
              autocomplete="username"
              autofocus
              [class.is-invalid]="msg('username')"
            />
            @if (msg('username'); as m) {
              <span class="field-error">{{ m }}</span>
            }
          </label>
          <label>
            Contraseña
            <div class="password-input-wrap">
              <input
                formControlName="password"
                [type]="showPassword() ? 'text' : 'password'"
                autocomplete="current-password"
                [class.is-invalid]="msg('password')"
              />
              <button
                type="button"
                class="password-toggle-btn"
                (click)="showPassword.set(!showPassword())"
                [title]="showPassword() ? 'Ocultar contraseña' : 'Ver contraseña'"
                [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Ver contraseña'"
              >
                {{ showPassword() ? '👁' : '👁' }}
              </button>
            </div>
            @if (msg('password'); as m) {
              <span class="field-error">{{ m }}</span>
            }
          </label>

          @if (error()) {
            <p class="alert error">{{ error() }}</p>
          }
          <button class="btn primary block auth-submit" type="submit" [disabled]="loading() || form.invalid">
            {{ loading() ? 'Ingresando…' : 'Ingresar' }}
          </button>
          <p class="auth-help">¿Olvidaste tu contraseña? Pide a GHD que la restablezca.</p>
        </form>
      </section>

      <aside class="login-visual" aria-hidden="true">
        <!-- IMAGEN DECORATIVA: frontend/public/assets/login/login.jpg (se sirve como assets/login/login.jpg).
             Para cambiarla, reemplaza ese archivo o actualiza este src. -->
        <img src="assets/login/login.jpg" alt="" loading="lazy" decoding="async" />
      </aside>
    </main>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(60)]],
    password: ['', [Validators.required, Validators.maxLength(100)]],
  });

  private readonly messages: Record<string, Record<string, string>> = {
    username: { required: 'Ingresa tu usuario.', maxlength: 'El usuario no puede exceder 60 caracteres.' },
    password: { required: 'Ingresa tu contraseña.', maxlength: 'La contraseña no puede exceder 100 caracteres.' },
  };

  msg(field: 'username' | 'password'): string | null {
    return firstError(this.form.get(field), this.messages[field]);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { username, password } = this.form.getRawValue();
    this.loading.set(true);
    this.error.set('');
    this.auth.login(username.trim(), password).subscribe({
      next: () => this.router.navigateByUrl(this.auth.homeUrl()),
      error: async (e) => {
        this.error.set(await errorMessage(e));
        this.loading.set(false);
      },
    });
  }
}
