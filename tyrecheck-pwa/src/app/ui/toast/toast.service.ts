import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastState {
  show: boolean;
  kind: ToastKind;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _state = new BehaviorSubject<ToastState>({
    show: false,
    kind: 'info',
    message: '',
  });

  readonly state$ = this._state.asObservable();
  private timer?: number;

  show(kind: ToastKind, message: string, ms = 2600) {
    if (this.timer) window.clearTimeout(this.timer);
    this._state.next({ show: true, kind, message });
    this.timer = window.setTimeout(() => {
      this._state.next({ show: false, kind, message: '' });
    }, ms);
  }

  info(msg: string, ms?: number) { this.show('info', msg, ms); }
  success(msg: string, ms?: number) { this.show('success', msg, ms); }
  error(msg: string, ms?: number) { this.show('error', msg, ms); }
}
