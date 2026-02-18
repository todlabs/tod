export interface ExperimentalFeature {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export class ExperimentalConfig {
  private features: Map<string, ExperimentalFeature> = new Map();

  constructor() {
    // Инициализируем доступные экспериментальные функции
    this.features.set('background_tasks', {
      id: 'background_tasks',
      name: 'Background Tasks',
      description: 'Позволяет запускать фоновые агенты для выполнения задач параллельно основному агенту',
      enabled: false,
    });
  }

  getFeatures(): ExperimentalFeature[] {
    return Array.from(this.features.values());
  }

  getFeature(id: string): ExperimentalFeature | undefined {
    return this.features.get(id);
  }

  toggleFeature(id: string): boolean {
    const feature = this.features.get(id);
    if (feature) {
      feature.enabled = !feature.enabled;
      return feature.enabled;
    }
    return false;
  }

  isEnabled(id: string): boolean {
    const feature = this.features.get(id);
    return feature?.enabled ?? false;
  }

  setFeature(id: string, enabled: boolean): void {
    const feature = this.features.get(id);
    if (feature) {
      feature.enabled = enabled;
    }
  }
}

export const experimentalConfig = new ExperimentalConfig();
