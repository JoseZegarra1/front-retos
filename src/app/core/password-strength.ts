import { Component, computed, input } from '@angular/core';
import { passwordStrength } from './validators';

/** Barra de fortaleza de contraseña: `<app-password-strength [value]="pwd" />`. */
@Component({
  selector: 'app-password-strength',
  template: `
    @if (strength().score > 0) {
      <span class="pw-strength" [class]="'pw-strength s' + strength().score">
        <span class="pw-bar"><span [style.width.%]="strength().score * 25"></span></span>
        <span class="pw-label">Fortaleza: {{ strength().label }}</span>
      </span>
    }
  `,
})
export class PasswordStrengthMeter {
  readonly value = input<string | null | undefined>('');
  readonly strength = computed(() => passwordStrength(this.value() ?? ''));
}
