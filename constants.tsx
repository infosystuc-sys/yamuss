import { OPStatus, PaymentOrder } from './types';

/**
 * MOCK_ORDERS: Actualizado para usar los Enums normalizados en MAYÚSCULAS.
 * Esto asegura que incluso con datos de prueba, la lógica de visualización sea consistente.
 */
export const MOCK_ORDERS: PaymentOrder[] = [
  {
    id: '12345',
    number: 'OP-00012345',
    provider: 'Tech Solutions SRL',
    cuit: '30-71234567-9',
    date: '2023-10-24',
    grossAmount: 1450200.00,
    netAmount: 1418500.00,
    status: OPStatus.PENDIENTE, // Antes PENDING
    initials: 'TS'
  },
  {
    id: '12346',
    number: 'OP-00012346',
    provider: 'Logistics Pro S.A.',
    cuit: '33-65432109-2',
    date: '2023-10-25',
    grossAmount: 850400.00,
    netAmount: 832000.00,
    status: OPStatus.REVISADA, // Antes REVIEWED
    initials: 'LP'
  },
  {
    id: '12347',
    number: 'OP-00012347',
    provider: 'Insumos Industriales',
    cuit: '20-11223344-5',
    date: '2023-10-25',
    grossAmount: 2200000.00,
    netAmount: 2150000.00,
    status: OPStatus.DISCREPANCIA, // Antes DISCREPANCY
    initials: 'II'
  }
];

/**
 * STATUS_STYLE: Estilos por estado en formato punto + texto.
 * Cada entrada expone:
 *   - dot: clase de color para el bullet (•)
 *   - text: clase de color para el label
 *   - label: texto a mostrar (Title Case)
 */
/**
 * Estilo por estado. Usa hex inline para garantizar que se apliquen
 * (evitamos el JIT del Tailwind Play CDN que pierde clases dinámicas
 * en filas renderizadas async).
 *
 * Los colores 'main' coinciden 1:1 con los del borde superior de las
 * stat cards del panel (amber-500 / sky-500 / emerald-500).
 */
export const STATUS_STYLE: Record<string, { bg: string; border: string; main: string; label: string }> = {
  [OPStatus.PENDIENTE]:   { bg: '#fef3c7', border: '#fcd34d', main: '#f59e0b', label: 'Pendiente' },
  [OPStatus.REVISADA]:    { bg: '#e0f2fe', border: '#7dd3fc', main: '#0ea5e9', label: 'Revisada' },
  [OPStatus.TRANSFERIDA]: { bg: '#d1fae5', border: '#6ee7b7', main: '#10b981', label: 'Transferida' },
};

export const getStatusStyle = (status: string) =>
  STATUS_STYLE[status?.toUpperCase() as OPStatus] ?? { bg: '#f5f5f4', border: '#d6d3d1', main: '#78716c', label: status };