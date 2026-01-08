import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { ButtonComponent } from '../ui/button/button.component';
import { ScanStore, ScanState } from '../services/scan-store.service';

@Component({
  selector: 'app-result',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './result.component.html',
  styleUrl: './result.component.css',
})
export class ResultComponent implements OnInit, OnDestroy {
  @Output() restart = new EventEmitter<void>();

  private sub?: Subscription;

  imageUrl: string | null = null;
  predictedClass: string | null = null;
  confidence: number | null = null;
  probs: Record<string, number> | null = null;

  status: 'success' | 'warning' = 'success';
  score = 0;
  color = '#00e5cc';

  // ⬇️ TEXTES FR
  title = 'État excellent';
  description = 'Vos pneus sont en excellent état. Sécurisés pour toutes les conditions.';

  constructor(private store: ScanStore) {}

  ngOnInit(): void {
    this.sub = this.store.state$.subscribe((s: ScanState) => {
      if (s.status === 'result') {
        this.imageUrl = s.imageUrl;
        this.predictedClass = s.result.class ?? null;
        this.confidence =
          typeof s.result.confidence === 'number' ? s.result.confidence : null;
        this.probs = s.result.probs ?? null;
      } else if (s.status === 'processing') {
        // garder l'image pendant la transition
        this.imageUrl = s.imageUrl;
        this.predictedClass = null;
        this.confidence = null;
        this.probs = null;
      } else {
        this.imageUrl = null;
        this.predictedClass = null;
        this.confidence = null;
        this.probs = null;
      }

      const cls = (this.predictedClass ?? '').toLowerCase();
      const isBad = cls === 'defective';

      this.status = isBad ? 'warning' : 'success';
      this.score = this.confidence ? Math.round(this.confidence * 100) : 0;
      this.color = isBad ? '#ff4444' : '#00e5cc';

      // ⬇️ TEXTES FR DYNAMIQUES
      this.title = isBad ? 'Remplacement nécessaire' : 'État excellent';
      this.description = isBad
        ? 'La profondeur des rainures est critique. Risque élevé d’aquaplaning.'
        : 'Vos pneus sont en excellent état. Sécurisés pour toutes les conditions.';
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onRestart(): void {
    // remet le store en mode camera + demande au parent de repasser sur camera
    this.store.resetToCamera();
    this.restart.emit();
  }

  probsText(): string {
    if (!this.probs) return '';
    return Object.entries(this.probs)
      .map(([k, v]) => `${k} : ${(v * 100).toFixed(1)}%`)
      .join(' • ');
  }
}
