import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ScanStore, ScanState } from '../services/scan-store.service';

@Component({
  selector: 'app-processing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './processing.component.html',
  styleUrl: './processing.component.css',
})
export class ProcessingComponent implements OnInit, OnDestroy {
  @Output() complete = new EventEmitter<void>();

  private sub?: Subscription;
  private stepTimer?: ReturnType<typeof setInterval>;
  private completed = false;

  step = 0;
  imageUrl: string | null = null;

  // ⬇️ TEXTES FR
  steps = [
    'Analyse de la profondeur des rainures…',
    'Cartographie des motifs d’usure…',
    'Comparaison avec la base de données…',
    'Finalisation du diagnostic…',
  ];

  constructor(private store: ScanStore) {}

  ngOnInit(): void {
    // garder l'image visible pendant processing ET result (évite le “flash”)
    this.sub = this.store.state$.subscribe((s: ScanState) => {
      if (s.status === 'processing' || s.status === 'result') {
        this.imageUrl = s.imageUrl;
      } else if (s.status === 'error') {
        this.imageUrl = s.imageUrl ?? null;
      } else {
        this.imageUrl = null;
      }

      // Dès que le store passe à result -> on termine et on émet complete()
      if (s.status === 'result') {
        this.finish();
      }
    });

    // animation steps
    this.step = 0;
    this.stepTimer = setInterval(() => {
      this.step = Math.min(this.step + 1, this.steps.length - 1);
      if (this.step >= this.steps.length - 1 && this.stepTimer) {
        clearInterval(this.stepTimer);
      }
    }, 1200);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.stepTimer) clearInterval(this.stepTimer);
  }

  private finish(): void {
    if (this.completed) return;
    this.completed = true;

    if (this.stepTimer) clearInterval(this.stepTimer);
    this.step = this.steps.length - 1;

    // petite pause pour une transition plus douce
    setTimeout(() => this.complete.emit(), 450);
  }
}
