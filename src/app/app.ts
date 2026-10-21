import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ROLE_LABEL } from './core/models';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly roleLabel = ROLE_LABEL;

  protected showNav(): boolean {
    const u = this.auth.user();
    return this.auth.isLoggedIn() && !!u && !u.mustChangePassword;
  }
}
