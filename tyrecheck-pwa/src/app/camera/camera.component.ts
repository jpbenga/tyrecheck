import {
  Component,
  EventEmitter,
  Output,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { ScannerOverlayComponent } from '../ui/scanner-overlay/scanner-overlay.component';
import { ApiService, AnalyzeResult } from '../services/api.service';
import { ScanStore } from '../services/scan-store.service';

type CameraMode = 'camera' | 'upload';

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule, ScannerOverlayComponent],
  templateUrl: './camera.component.html',
  styleUrl: './camera.component.css',
})
export class CameraComponent implements AfterViewInit, OnDestroy {
  @Output() back = new EventEmitter<void>();
  @Output() capture = new EventEmitter<void>();

  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  mode: CameraMode = 'camera';
  isReady = false;

  private stream: MediaStream | null = null;
  cameraError: string | null = null;

  selectedFile: File | null = null;
  previewUrl: string | null = null;

  isUploading = false;
  errorMessage: string | null = null;

  constructor(private api: ApiService, private store: ScanStore) {}

  async ngAfterViewInit(): Promise<void> {
    setTimeout(() => (this.isReady = true), 400);
    await this.startCameraOrFallback();
  }

  ngOnDestroy(): void {
    this.stopCamera();

    /**
     * ✅ IMPORTANT
     * Ne PAS revoke la previewUrl ici.
     * Pourquoi ? Parce que Processing/Result utilisent cette même blob URL comme background.
     * Si on revoke ici (au moment où Camera est détruit via *ngIf),
     * alors l'image n'existe plus => fond vide.
     *
     * On nettoie la previewUrl seulement quand on reset/recommence un scan,
     * ou quand on remplace la photo (dans clearPreview() avant de créer une nouvelle).
     */
  }

  onBack(): void {
    this.stopCamera();

    // si tu veux, tu peux nettoyer quand on quitte VRAIMENT le flow
    this.clearPreview();

    this.back.emit();
  }

  // ---------- MODE SWITCH ----------
  async switchToUpload(): Promise<void> {
    this.stopCamera();
    this.mode = 'upload';
    this.cameraError = null;
    this.errorMessage = null;
  }

  async switchToUploadAndPick(): Promise<void> {
    await this.switchToUpload();
    this.triggerFilePicker();
  }

  async switchToCamera(): Promise<void> {
    // ici oui: si on repart en mode camera, on peut nettoyer la preview
    this.clearPreview();
    this.mode = 'camera';
    this.errorMessage = null;
    await this.startCameraOrFallback();
  }

  // ---------- CAMERA ----------
  private async startCameraOrFallback(): Promise<void> {
    this.cameraError = null;
    this.mode = 'camera';

    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraError = 'Camera not supported on this device/browser.';
      this.mode = 'upload';
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      const video = this.videoEl?.nativeElement;
      if (!video) {
        this.cameraError = 'Video element not found.';
        this.mode = 'upload';
        this.stopCamera();
        return;
      }

      video.srcObject = this.stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;

      await video.play().catch(() => {
        // autoplay parfois bloqué
      });

      this.mode = 'camera';
    } catch (e: any) {
      this.cameraError =
        e?.name === 'NotAllowedError'
          ? 'Camera permission denied. Please upload a photo instead.'
          : e?.message ?? 'Could not access camera.';
      this.mode = 'upload';
      this.stopCamera();
    }
  }

  private stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    const video = this.videoEl?.nativeElement;
    if (video) {
      video.pause();
      // @ts-ignore
      video.srcObject = null;
    }
  }

  async enableCamera(): Promise<void> {
    await this.startCameraOrFallback();
  }

  async captureFromCamera(): Promise<void> {
    if (!this.videoEl?.nativeElement) return;

    const video = this.videoEl.nativeElement;
    if (video.readyState < 2) {
      this.errorMessage = 'Camera is not ready yet.';
      return;
    }

    this.errorMessage = null;

    const canvas = document.createElement('canvas');
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.errorMessage = 'Could not capture image.';
      return;
    }

    ctx.drawImage(video, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );

    if (!blob) {
      this.errorMessage = 'Could not encode image.';
      return;
    }

    const file = new File([blob], `capture_${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });

    this.selectedFile = file;

    // preview blob (⚠️ on revoke l’ancienne, pas la nouvelle)
    this.clearPreview();
    this.previewUrl = URL.createObjectURL(blob);

    await this.startAnalyze();
  }

  // ---------- UPLOAD ----------
  triggerFilePicker(): void {
    const input = this.fileInput?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;
    if (!file) return;

    this.selectedFile = file;
    this.errorMessage = null;

    this.clearPreview();
    this.previewUrl = URL.createObjectURL(file);

    this.startAnalyze();
  }

  private clearPreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }

  // ---------- ANALYZE ----------
  private async startAnalyze(): Promise<void> {
    if (!this.selectedFile || !this.previewUrl) {
      this.errorMessage = 'Please select or capture an image first.';
      return;
    }

    this.isUploading = true;
    this.errorMessage = null;

    // ✅ stocke la blob url dans le store: Processing/Result vont l’utiliser
    this.store.processing(this.previewUrl);

    // ✅ passe à l’écran processing tout de suite
    this.capture.emit();

    try {
      const res: AnalyzeResult = await this.api.analyzeImage(this.selectedFile);

      if ((res as any).error) {
        const err = (res as any).error as string;
        const details = (res as any).details as string | undefined;
        this.store.error(err, details, this.previewUrl);
        this.errorMessage = err;
        return;
      }

      this.store.done(this.previewUrl, {
        class: res.class,
        confidence: res.confidence,
        probs: res.probs ?? undefined,
      });
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to analyze image';
      this.store.error(msg, undefined, this.previewUrl);
      this.errorMessage = msg;
    } finally {
      this.isUploading = false;
    }
  }
}
