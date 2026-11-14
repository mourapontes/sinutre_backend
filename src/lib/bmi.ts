// Índice de Massa Corporal (IMC) e classificação segundo a OMS.

export type BmiSeverity = 'low' | 'normal' | 'warning' | 'danger';

export interface BmiInfo {
  /** IMC com uma casa decimal. */
  value: number;
  classification: 'ABAIXO_DO_PESO' | 'PESO_NORMAL' | 'SOBREPESO' | 'OBESIDADE';
  label: string;
  severity: BmiSeverity;
  /** Faixa de referência em texto, ex.: "18,5 – 24,9". */
  range: string;
}

/** IMC = peso (kg) / altura² (m). */
export function computeBmi(weightKg: number, heightM: number): number {
  const value = weightKg / (heightM * heightM);
  return Math.round(value * 10) / 10;
}

export function classifyBmi(value: number): BmiInfo {
  if (value < 18.5) {
    return {
      value,
      classification: 'ABAIXO_DO_PESO',
      label: 'Abaixo do peso',
      severity: 'low',
      range: 'IMC < 18,5',
    };
  }

  if (value < 25) {
    return {
      value,
      classification: 'PESO_NORMAL',
      label: 'Peso normal',
      severity: 'normal',
      range: '18,5 – 24,9',
    };
  }

  if (value < 30) {
    return {
      value,
      classification: 'SOBREPESO',
      label: 'Sobrepeso',
      severity: 'warning',
      range: '25,0 – 29,9',
    };
  }

  return {
    value,
    classification: 'OBESIDADE',
    label: 'Obesidade',
    severity: 'danger',
    range: 'IMC ≥ 30,0',
  };
}

export function bmiInfo(weightKg: number, heightM: number): BmiInfo {
  return classifyBmi(computeBmi(weightKg, heightM));
}
