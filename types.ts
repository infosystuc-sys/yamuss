export interface Role {
  ID: number;
  Nombre: string;
  Descripcion: string;
}

export interface AppUser {
  ID: number;
  Usuario: string;
  Rol: string;
  RolId: number;
  Activo: boolean;
  PrimerLogin: boolean;
  FechaCreacion: string;
}

export enum OPStatus {
  PENDIENTE = 'PENDIENTE',
  REVISADA = 'REVISADA',
  TRANSFERIDA = 'TRANSFERIDA' // Alineado con la L448 del backend
}

export interface PaymentOrder {
  id: string;
  number: string;
  provider: string;
  providerCode?: string;
  cuit: string;
  cbu?: string;
  email?: string;
  date: string;
  grossAmount: number;
  netAmount: number;
  status: OPStatus;
  initials: string;
  emailEnviado?: boolean;
  treasuryMovements?: TreasuryMovement[];
}


export interface Invoice {
  invoiceNumber: string;
  invoiceType: string;
  amountPaid: number;
}

export interface Retention {
  code: string;
  name: string;
  amount: number;
  appliedRate: number;
  baseAmount: number;
  certificado?: string;
}

export interface TreasuryMovement {
  cuenta: string;
  descripcion: string;
  leyenda: string;
  monto: number;
}

export interface PadronData {
  ALICUOTA: number;
  VIGENCIA_DESDE?: string;
  VIGENCIA_HASTA?: string;
}

export interface ValidationResult {
  status: 'OK' | 'WARNING' | 'ERROR' | 'UNKNOWN';
  message: string;
}

export interface TemValidation {
  found: boolean;
  nombre?: string;
  periodo?: string;
  hasRetention: boolean;
  expectedRate: number;
  status: 'OK' | 'ERROR';
  message: string;
}

export interface RetentionResponse {
  retentions: Retention[];
  padron: PadronData | null;
  validation: ValidationResult;
  temValidation: TemValidation | null;
  providerCuit: string;
}
