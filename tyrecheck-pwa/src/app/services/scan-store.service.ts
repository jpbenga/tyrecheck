import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AnalyzeResult = {
  class: string;
  confidence: number;
  probs?: Record<string, number>;
};

export type ScanState =
  | { status: 'idle' }
  | { status: 'camera' }
  | { status: 'processing'; imageUrl: string }
  | { status: 'result'; imageUrl: string; result: AnalyzeResult }
  | { status: 'error'; imageUrl?: string; message: string; details?: string };

@Injectable({ providedIn: 'root' })
export class ScanStore {
  private subject = new BehaviorSubject<ScanState>({ status: 'idle' });
  state$ = this.subject.asObservable();

  get snapshot(): ScanState {
    return this.subject.value;
  }

  resetToCamera(): void {
    this.subject.next({ status: 'camera' });
  }

  processing(imageUrl: string): void {
    this.subject.next({ status: 'processing', imageUrl });
  }

  done(imageUrl: string, result: AnalyzeResult): void {
    this.subject.next({ status: 'result', imageUrl, result });
  }

  error(message: string, details?: string, imageUrl?: string): void {
    this.subject.next({ status: 'error', message, details, imageUrl });
  }
}
