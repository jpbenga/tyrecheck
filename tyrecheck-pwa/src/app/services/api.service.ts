import { Injectable } from '@angular/core';

export type AnalyzeResult = {
  class: string;
  confidence: number;
  probs?: Record<string, number>;
  error?: string;
  details?: string;
};

@Injectable({ providedIn: 'root' })
export class ApiService {
  // IMPORTANT: URL RELATIVE pour utiliser le proxy Angular
  private readonly analyzeUrl = '/analyze';

  async analyzeImage(file: File): Promise<AnalyzeResult> {
    const form = new FormData();
    form.append('image', file);

    const res = await fetch(this.analyzeUrl, {
      method: 'POST',
      body: form,
    });

    // Si backend renvoie un HTML (redirect/auth), ça évite de planter en JSON.parse
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    if (!res.ok) {
      return {
        class: 'error',
        confidence: 0,
        error: `HTTP ${res.status}`,
        details: text.slice(0, 500),
      };
    }

    if (!contentType.includes('application/json')) {
      return {
        class: 'error',
        confidence: 0,
        error: 'Non-JSON response',
        details: text.slice(0, 500),
      };
    }

    return JSON.parse(text) as AnalyzeResult;
  }
}
