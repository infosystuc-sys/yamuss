import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PaymentOrder, Invoice, RetentionResponse, TreasuryMovement, TemValidation } from '../types';
import { fetchOrder, fetchOrderInvoices, fetchOrderRetentions, reviewOrder, ReviewResult } from '../services/api';
import { getStatusStyle } from '../constants';
import { useAuth } from '../contexts/AuthContext';

export const OrderDetailScreen = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const canReview = user?.role === 'ADMINISTRADOR';
    const [order, setOrder] = useState<PaymentOrder | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [retentionData, setRetentionData] = useState<RetentionResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
    const [reviewing, setReviewing] = useState(false);

    useEffect(() => {
        if (!id) return;
        const loadData = async () => {
            try {
                const [orderData, invoicesData, retData] = await Promise.all([
                    fetchOrder(id),
                    fetchOrderInvoices(id),
                    fetchOrderRetentions(id)
                ]);
                setOrder(orderData);
                setInvoices(invoicesData);
                setRetentionData(retData);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id]);

    const handleConfirmReview = async () => {
        if (!id) return;
        setReviewing(true);
        try {
            const result = await reviewOrder(id);
            setReviewResult(result);
            setOrder(prev => prev ? { ...prev, status: 'Revisada' as any } : prev);
        } catch (err: any) {
            alert(err?.message || "Error al confirmar revisión");
        } finally {
            setReviewing(false);
        }
    };

    const handleDownloadPDF = () => {
        if (!reviewResult?.pdfBase64) return;
        const byteChars = atob(reviewResult.pdfBase64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `OP_${id}_Comprobante.pdf`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) return <div className="p-8 text-center text-ink-soft">Cargando detalles...</div>;
    if (error || !order) return <div className="p-8 text-center text-red-500">Error: {error}</div>;

    const validation = retentionData?.validation;
    const isValidationOk = validation?.status === 'OK';
    const isValidationWarning = validation?.status === 'WARNING' || validation?.status === 'UNKNOWN';

    const totalRetentions = (retentionData?.retentions || []).reduce((acc, curr) => acc + curr.amount, 0);
    const calculatedNet = (order.grossAmount || 0) - totalRetentions;

    const isTransferida = (order.status || '').toUpperCase() === 'TRANSFERIDA';
    const isRevisada = (order.status || '').toUpperCase() === 'REVISADA';
    const canConfirmReview = canReview && !isTransferida && !isRevisada;

    const statusStyle = getStatusStyle(order.status as any);
    const fmt = (n: number | undefined) => `$ ${(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">

            {/* Back link */}
            <button
                onClick={() => navigate('/dashboard')}
                className="text-sm text-ink-soft hover:text-primary flex items-center gap-1 transition-colors"
            >
                ← Volver al panel
            </button>

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="font-serif text-3xl font-semibold text-ink dark:text-white">
                        Orden de pago <span className="text-primary">#{order.number}</span>
                    </h1>
                    <p className="text-ink-soft dark:text-slate-400 mt-2 text-sm">
                        Proveedor: <span className="font-semibold text-ink dark:text-slate-200">{order.provider}</span>
                        <span className="mx-2">·</span>
                        CUIT: <span className="font-mono text-ink dark:text-slate-200">{order.cuit}</span>
                    </p>
                    <p className="text-ink-soft dark:text-slate-400 mt-1 text-sm">
                        Fecha de emisión: <span className="font-semibold text-ink dark:text-slate-200">{order.date}</span>
                    </p>
                </div>
                <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-medium"
                    style={{ backgroundColor: statusStyle.bg, borderColor: statusStyle.border, color: statusStyle.main }}
                >
                    <span
                        className="inline-block size-2 rounded-full"
                        style={{ backgroundColor: statusStyle.main }}
                    />
                    {statusStyle.label}
                </span>
            </div>

            {/* Alerta OP Transferida */}
            {isTransferida && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 text-amber-800 dark:text-amber-200">
                    <span className="material-symbols-outlined text-xl mt-0.5">block</span>
                    <p className="font-semibold text-sm">Esta Orden de Pago ya fue transferida y está bloqueada para nuevas revisiones.</p>
                </div>
            )}

            {/* Validación de padrón IIBB */}
            {validation && (
                <div className={`flex items-start gap-3 p-4 rounded-xl border ${isValidationOk
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-200'
                        : isValidationWarning
                            ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200'
                            : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200'
                    }`}>
                    <span className="material-symbols-outlined text-xl mt-0.5">
                        {isValidationOk ? 'check_circle' : isValidationWarning ? 'warning' : 'error'}
                    </span>
                    <p className="text-sm">
                        <span className="font-semibold">Padrón IIBB:</span> {validation.message}
                        {retentionData?.padron && (
                            <> Alícuota padrón: <strong>{retentionData.padron.ALICUOTA}%</strong></>
                        )}
                    </p>
                </div>
            )}

            {/* Validación de padrón TEM */}
            {retentionData?.temValidation?.found && (
                retentionData.temValidation.hasRetention ? (
                    <div className="flex items-start gap-3 p-4 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-200">
                        <span className="material-symbols-outlined text-xl mt-0.5">check_circle</span>
                        <p className="text-sm">
                            <span className="font-semibold">Padrón TEM:</span> El proveedor figura en el padrón
                            {retentionData.temValidation.periodo ? ` (${retentionData.temValidation.periodo})` : ''}.
                            Retención TEM aplicada correctamente.
                        </p>
                    </div>
                ) : (
                    <div className="flex items-start gap-3 p-4 rounded-xl border bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200">
                        <span className="material-symbols-outlined text-xl mt-0.5">error</span>
                        <div className="text-sm">
                            <p className="font-semibold">Padrón TEM: Se debe aplicar la retención</p>
                            <p className="mt-0.5">
                                El proveedor <strong>{retentionData.temValidation.nombre}</strong> figura en el Padrón TEM
                                {retentionData.temValidation.periodo ? ` (período ${retentionData.temValidation.periodo})` : ''}.
                                No se encontró retención TEM en esta orden de pago.
                            </p>
                        </div>
                    </div>
                )
            )}

            {/* Toast de confirmación */}
            {reviewResult && (
                <div className={`flex items-start gap-3 p-4 rounded-xl border shadow-sm animate-fade-in ${reviewResult.emailSent
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                    <span className="material-symbols-outlined text-xl mt-0.5">
                        {reviewResult.emailSent ? 'mark_email_read' : 'warning'}
                    </span>
                    <div className="flex-1">
                        <p className="font-semibold text-sm">
                            {reviewResult.emailSent
                                ? `Revisión confirmada. Comprobante enviado a ${reviewResult.providerEmail}.`
                                : reviewResult.emailError
                                    ? `Revisión confirmada. Error al enviar email: ${reviewResult.emailError}`
                                    : 'Revisión confirmada. El proveedor no tiene email registrado — el comprobante no fue enviado.'}
                        </p>
                    </div>
                    {reviewResult.pdfBase64 && (
                        <button
                            onClick={handleDownloadPDF}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-light border border-current text-xs font-bold hover:bg-background-light transition-colors whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-[16px]">download</span>
                            Descargar PDF
                        </button>
                    )}
                </div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">

                    {/* FACTURAS */}
                    <section className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden">
                        <header className="px-6 pt-5 pb-3 flex items-center gap-2">
                            <h3 className="font-serif text-lg font-semibold text-ink dark:text-white">Facturas imputadas</h3>
                            <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-bold bg-background-light dark:bg-slate-700 text-ink-soft dark:text-slate-300 border border-border-light">
                                {invoices.length}
                            </span>
                        </header>
                        <table className="w-full text-left text-sm">
                            <thead className="text-[10px] uppercase tracking-[0.15em] text-ink-muted font-bold border-y border-border-light dark:border-slate-700 bg-background-light/60 dark:bg-slate-800/30">
                                <tr>
                                    <th className="py-3 px-6">Comprobante</th>
                                    <th className="py-3 px-6">Tipo</th>
                                    <th className="py-3 px-6 text-right">Importe pagado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-light/60 dark:divide-slate-700">
                                {invoices.map((inv, idx) => (
                                    <tr key={idx} className="hover:bg-background-light/60 dark:hover:bg-slate-800/30">
                                        <td className="py-3 px-6 font-mono text-ink dark:text-slate-300">{inv.invoiceNumber}</td>
                                        <td className="py-3 px-6 text-ink-soft">{inv.invoiceType}</td>
                                        <td className="py-3 px-6 text-right font-semibold font-mono text-ink dark:text-white">{fmt(inv.amountPaid)}</td>
                                    </tr>
                                ))}
                                {invoices.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-ink-muted">No hay facturas asociadas visibles.</td></tr>}
                            </tbody>
                        </table>
                    </section>

                    {/* RETENCIONES */}
                    <section className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden">
                        <header className="px-6 pt-5 pb-3">
                            <h3 className="font-serif text-lg font-semibold text-ink dark:text-white">Retenciones impositivas</h3>
                        </header>
                        <table className="w-full text-left text-sm">
                            <thead className="text-[10px] uppercase tracking-[0.15em] text-ink-muted font-bold border-y border-border-light dark:border-slate-700 bg-background-light/60 dark:bg-slate-800/30">
                                <tr>
                                    <th className="py-3 px-6">Cód.</th>
                                    <th className="py-3 px-6">Descripción</th>
                                    <th className="py-3 px-6">Certificado</th>
                                    <th className="py-3 px-6 text-right">Base de cálculo</th>
                                    <th className="py-3 px-6 text-right">Importe retenido</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-light/60 dark:divide-slate-700">
                                {(retentionData?.retentions || []).map((ret, idx) => (
                                    <tr key={idx} className="hover:bg-background-light/60 dark:hover:bg-slate-800/30">
                                        <td className="py-3 px-6 font-mono text-ink dark:text-slate-300 font-bold">{ret.code}</td>
                                        <td className="py-3 px-6 text-ink-soft">{ret.name}</td>
                                        <td className="py-3 px-6 font-mono text-ink-soft">{ret.certificado ?? '-'}</td>
                                        <td className="py-3 px-6 text-right font-mono text-ink-soft">{fmt(ret.baseAmount)}</td>
                                        <td className="py-3 px-6 text-right font-semibold font-mono text-ink dark:text-white">{fmt(ret.amount)}</td>
                                    </tr>
                                ))}
                                {(retentionData?.retentions || []).length === 0 && <tr><td colSpan={5} className="py-8 text-center text-ink-muted">No hay retenciones.</td></tr>}
                            </tbody>
                        </table>
                    </section>

                    {/* MOVIMIENTO DE TESORERÍA */}
                    <section className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden">
                        <header className="px-6 pt-5 pb-3">
                            <h3 className="font-serif text-lg font-semibold text-ink dark:text-white">Movimiento de tesorería</h3>
                        </header>
                        <table className="w-full text-left text-sm">
                            <thead className="text-[10px] uppercase tracking-[0.15em] text-ink-muted font-bold border-y border-border-light dark:border-slate-700 bg-background-light/60 dark:bg-slate-800/30">
                                <tr>
                                    <th className="py-3 px-6">Cuenta</th>
                                    <th className="py-3 px-6">Descripción</th>
                                    <th className="py-3 px-6 text-right">Importe</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-light/60 dark:divide-slate-700">
                                {(order.treasuryMovements || []).map((tm: TreasuryMovement, idx: number) => (
                                    <tr key={idx} className="hover:bg-background-light/60 dark:hover:bg-slate-800/30">
                                        <td className="py-3 px-6 font-mono text-ink dark:text-slate-300">{tm.cuenta}</td>
                                        <td className="py-3 px-6 text-ink-soft">{tm.descripcion}{tm.leyenda ? ` — ${tm.leyenda}` : ''}</td>
                                        <td className="py-3 px-6 text-right font-semibold font-mono text-ink dark:text-white">{fmt(tm.monto)}</td>
                                    </tr>
                                ))}
                                {(!order.treasuryMovements || order.treasuryMovements.length === 0) && (
                                    <tr><td colSpan={3} className="py-8 text-center text-ink-muted">Sin movimientos de tesorería.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </section>
                </div>

                {/* Right Column: Totales + Acciones */}
                <div className="space-y-6">
                    <section className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark p-6 shadow-sm">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-soft dark:text-slate-400 mb-5">Totales</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-ink-soft dark:text-slate-400">Importe bruto</span>
                                <span className="font-mono font-semibold text-ink dark:text-white">{fmt(order.grossAmount)}</span>
                            </div>
                            {(retentionData?.retentions || []).map((ret, idx) => (
                                <div key={idx} className="flex justify-between text-ink-soft">
                                    <span>{ret.name}{ret.appliedRate ? ` (${ret.appliedRate}%)` : ''}</span>
                                    <span className="font-mono">— {fmt(ret.amount)}</span>
                                </div>
                            ))}
                            <div className="pt-4 mt-2 border-t border-border-light dark:border-slate-700 flex justify-between items-baseline">
                                <span className="font-serif text-base font-semibold text-ink dark:text-white">Neto a pagar</span>
                                <span className="font-mono font-bold text-xl text-ink dark:text-white">{fmt(calculatedNet)}</span>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            {canReview ? (
                                <button
                                    onClick={handleConfirmReview}
                                    disabled={!canConfirmReview || reviewing}
                                    className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${!canConfirmReview
                                        ? 'bg-background-light dark:bg-slate-800 text-ink-muted border border-border-light cursor-not-allowed'
                                        : reviewing
                                            ? 'bg-confirm-dark text-white cursor-wait'
                                            : 'bg-confirm text-white hover:bg-confirm-dark shadow-md'
                                        }`}
                                >
                                    {isTransferida
                                        ? <><span className="material-symbols-outlined text-[18px]">block</span> OP ya transferida</>
                                        : isRevisada
                                            ? <><span className="material-symbols-outlined text-[18px]">lock</span> OP ya revisada</>
                                            : reviewing
                                                ? <><span className="material-symbols-outlined text-[18px]">hourglass_top</span> Generando comprobante...</>
                                                : <>✓ Confirmar revisión</>}
                                </button>
                            ) : (
                                <div className="w-full py-3 rounded-xl text-xs text-center text-ink-muted bg-background-light dark:bg-slate-800 border border-border-light dark:border-slate-700 font-medium">
                                    <span className="material-symbols-outlined text-[14px] mr-1 align-middle">visibility</span>
                                    Modo solo lectura
                                </div>
                            )}

                            {reviewResult?.pdfBase64 && (
                                <button
                                    onClick={handleDownloadPDF}
                                    className="w-full py-3 rounded-xl font-semibold text-sm border border-border-light dark:border-slate-600 text-ink dark:text-slate-200 hover:bg-background-light dark:hover:bg-slate-800 flex items-center justify-center gap-2 transition-all"
                                >
                                    <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                                    Descargar comprobante PDF
                                </button>
                            )}

                            <p className="text-center text-[11px] text-ink-muted leading-snug">
                                Al confirmar, se genera el comprobante PDF y se envía al proveedor.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
