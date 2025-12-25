export interface OneRM {
  exercise: string;
  estimatedOneRM: number;
  date: Date;
}

export interface Volume {
  exercise: string;
  totalVolume: number;
  date: Date;
}

export interface StrengthStandard {
  exercise: string;
  weight: number;
  level: 'untrained' | 'novice' | 'intermediate' | 'advanced' | 'elite';
}

export interface AnalyticsData {
  oneRM: OneRM[];
  volume: Volume[];
  strengthStandards: StrengthStandard[];
}

