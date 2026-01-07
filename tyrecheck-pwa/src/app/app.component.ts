import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { Subscription } from 'rxjs';

import { LandingComponent } from './landing/landing.component';
import { CameraComponent } from './camera/camera.component';
import { ProcessingComponent } from './processing/processing.component';
import { ResultComponent } from './result/result.component';
import { ToastComponent } from './ui/toast/toast.component';

import { ScanStore, ScanState } from './services/scan-store.service';

type AppState = 'landing' | 'camera' | 'processing' | 'result';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NgIf,
    LandingComponent,
    CameraComponent,
    ProcessingComponent,
    ResultComponent,
    ToastComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  view: AppState = 'landing';
  private sub?: Subscription;

  constructor(private store: ScanStore) {}

  ngOnInit(): void {
    // ✅ Source de vérité : le store
    this.sub = this.store.state$.subscribe((s: ScanState) => {
      const next = this.mapStateToView(s);

      if (next !== this.view) {
        console.log('🧭 App view:', this.view, '->', next, ' | store:', s.status);
        this.view = next;
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  // --- Navigation manuelle (garde-les : utile pour back/start/restart) ---
  goLanding() {
    console.log('➡️ goLanding()');
    this.view = 'landing';
  }

  goCamera() {
    console.log('➡️ goCamera()');
    this.view = 'camera';
    // (optionnel) si tu veux que le store soit cohérent :
    // this.store.resetToCamera();
  }

  goProcessing() {
    console.log('➡️ goProcessing()');
    this.view = 'processing';
  }

  goResult() {
    console.log('➡️ goResult()');
    this.view = 'result';
  }

  // --- Mapping store -> view ---
  private mapStateToView(s: ScanState): AppState {
    switch (s.status) {
      case 'idle':
        return 'landing';
      case 'camera':
        return 'camera';
      case 'processing':
        return 'processing';
      case 'result':
        return 'result';
      case 'error':
        // tu peux choisir où aller en cas d'erreur.
        // Ici on reste sur camera pour permettre de réessayer.
        return 'camera';
      default:
        return 'landing';
    }
  }
}
