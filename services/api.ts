import { PaymentOrder, AppUser, Role } from '../types';

export const API_URL = `${window.location.origin}/api`;

export function getAuthHeaders(omitContentType = false): Record<string, string> {
    const headers: Record<string, string> = omitContentType ? {} : {
        'Content-Type': 'application/json'
    };
    try {
        const stored = localStorage.getItem('auth_user');
        if (stored) {
            const user = JSON.parse(stored);
            if (user?.token) {
                headers['Authorization'] = `Bearer ${user.token}`;
            }
        }
    } catch {
        // Silently ignore
    }
    return headers;
}

export async function fetchServerTime(): Promise<Date> {
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) {
        throw new Error(`Error fetching server time: ${response.statusText}`);
    }
    const data = await response.json();
    return new Date(data.timestamp);
}

export async function fetchOrders(status?: string): Promise<PaymentOrder[]> {
    try {
        let url = `${API_URL}/orders`;
        if (status && status !== 'ALL') {
            url += `?status=${status}`;
        }

        const response = await fetch(url, { headers: getAuthHeaders() });
        if (!response.ok) {
            throw new Error(`Error fetching orders: ${response.statusText}`);
        }
        const data = await response.json();
        return data as PaymentOrder[];
    } catch (error) {
        console.error("API Service Error:", error);
        throw error;
    }
}

export async function fetchOrder(id: string): Promise<PaymentOrder> {
    const response = await fetch(`${API_URL}/orders/${id}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch order');
    return response.json();
}

export async function fetchOrderInvoices(id: string): Promise<any[]> {
    const response = await fetch(`${API_URL}/orders/${id}/invoices`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch invoices');
    return response.json();
}

export async function fetchOrderRetentions(id: string): Promise<any> {
    const response = await fetch(`${API_URL}/orders/${id}/retentions`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch retentions');
    return response.json();
}

export interface ReviewResult {
    success: boolean;
    emailSent: boolean;
    providerEmail: string | null;
    emailError?: string;
    pdfBase64: string | null;
}

export async function reviewOrder(id: string): Promise<ReviewResult> {
    const response = await fetch(`${API_URL}/orders/${id}/review`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Error al confirmar revisión');
    return data;
}

export interface ProcessTreasuryResult {
    success: boolean;
    message: string;
    loteId: number;
    txtContent: string;
    fileName: string;
    pdfBase64: string | null;
    movementId: string;
}

export interface Batch {
    ID: number;
    FECHA_CREACION: string;
    CANTIDAD_OPS: number;
    MONTO_TOTAL: number;
    NOMBRE_ARCHIVO: string;
}

export interface BatchDetailItem {
    number: string;
    amount: number;
    providerName: string;
    emailEnviado?: boolean;
}

export async function fetchBatches(): Promise<Batch[]> {
    const response = await fetch(`${API_URL}/batches`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch batches');
    return response.json();
}

export async function fetchBatchDetail(id: number): Promise<BatchDetailItem[]> {
    const response = await fetch(`${API_URL}/batches/${id}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch batch detail');
    return response.json();
}

export async function processTreasury(opIds: string[], accountId: string, fileName?: string): Promise<ProcessTreasuryResult> {
    const response = await fetch(`${API_URL}/treasury/process`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ opIds, accountId, fileName })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to process treasury batch');
    return data;
}

export async function switchCompany(database: string): Promise<any> {
    const response = await fetch(`${API_URL}/auth/switch`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ database })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to switch company');
    return data;
}

export interface BatchEmailResult {
    success: boolean;
    totalOps: number;
    sent: number;
    failed: number;
    details: Array<{
        opNumber: string;
        sent: boolean;
        recipient: string | null;
        reason: string;
    }>;
}

export async function fetchOrderComprobante(id: string): Promise<string> {
    const response = await fetch(`${API_URL}/orders/${encodeURIComponent(id)}/comprobante`, { headers: getAuthHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al generar comprobante');
    return data.pdfBase64 as string;
}

export interface PadronConsultaResult {
    cuit: string;
    rentas: { CUIT: string; EXENTO: string | null; CONVENIO: string; DENOMINACION: string; PORCENTAJE: number | null; PERIODO: string | null; FECHA_IMPORTACION: string } | null;
    tem: { CUIT: string; NOMBRE: string; PERIODO: string | null; FECHA_IMPORTACION: string } | null;
}

export async function consultarPadron(cuit: string): Promise<PadronConsultaResult> {
    const response = await fetch(`${API_URL}/padron/consulta?cuit=${encodeURIComponent(cuit)}`, { headers: getAuthHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al consultar padrón');
    return data;
}

export async function sendBatchEmails(batchId: number, opNumbers?: string[]): Promise<BatchEmailResult> {
    const response = await fetch(`${API_URL}/batches/${batchId}/send-emails`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: opNumbers ? JSON.stringify({ opNumbers }) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al enviar comprobantes del lote');
    return data;
}

// ---- GESTIÓN DE USUARIOS ----

export async function fetchRoles(): Promise<Role[]> {
    const response = await fetch(`${API_URL}/roles`, { headers: getAuthHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener roles');
    return data;
}

export async function fetchUsers(): Promise<AppUser[]> {
    const response = await fetch(`${API_URL}/users`, { headers: getAuthHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener usuarios');
    return data;
}

export async function createUser(usuario: string, rolId: number): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ usuario, rolId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al crear usuario');
    return data;
}

export async function updateUser(id: number, changes: { rolId?: number; activo?: boolean }): Promise<void> {
    const response = await fetch(`${API_URL}/users/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(changes),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al actualizar usuario');
}

export async function resetUserPassword(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/users/${id}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al resetear contraseña');
}

export async function deleteUser(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/users/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al eliminar usuario');
}

// ---- PARÁMETROS INICIALES ----

export interface AppSettings {
    [key: string]: { valor: string; descripcion: string };
}

export async function fetchSettings(): Promise<AppSettings> {
    const response = await fetch(`${API_URL}/settings`, { headers: getAuthHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener configuración');
    return data;
}

export async function updateSettings(settings: Record<string, string>): Promise<void> {
    const response = await fetch(`${API_URL}/settings`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ settings }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al guardar configuración');
}

export async function bulkUpdateStatus(opIds: string[], status: 'Revisada' | 'Transferida'): Promise<{ updated: number }> {
    const response = await fetch(`${API_URL}/orders/bulk-status`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ opIds, status }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al actualizar estados');
    return data;
}
