import { Component, Input } from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-scanner-overlay',
  standalone: true,
  imports: [NgIf],
  templateUrl: './scanner-overlay.component.html',
  styleUrl: './scanner-overlay.component.css',
})
export class ScannerOverlayComponent {
  @Input() active: boolean = true;
}
