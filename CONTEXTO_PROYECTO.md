# CONTEXTO DEL PROYECTO: Gestor de Órdenes de Pago (Integración Tango T19)

## 1. DESCRIPCIÓN GENERAL
Aplicación web para la gestión, auditoría y procesamiento de Órdenes de Pago (OP) emitidas desde el ERP **Tango Gestión (Versión T19)**.
El sistema actúa como una capa satélite que lee datos de Tango, permite un flujo de revisión (auditoría de retenciones) y finaliza impactando movimientos en el módulo de Tesorería y generando archivos TXT para bancos.

## 2. ARQUITECTURA TÉCNICA
- **Tipo de App:** Web Application (Intranet).
- **Base de Datos:** Microsoft SQL Server (Conexión directa).
- **Integración:** Directa a nivel de base de datos (Sin APIs intermedias).
- **Permisos:** Lectura en módulo de Compras / Escritura controlada en módulo de Tesorería.

## 3. MAPA DE DATOS (DICCIONARIO DE TABLAS)

### A. Tablas Nativas de Tango (Lectura - Módulo Compras)
Estas tablas son la fuente de verdad. No se deben modificar, solo leer.

| Tabla | Descripción | Uso en la App | Clave de Relación (Join) |
| :--- | :--- | :--- | :--- |
| **CPA04** | Encabezado de Comprobantes | Fuente principal de las OPs. | `N_COMP` (Número), `T_COMP` (Tipo=OP) |
| **CPA01** | Proveedores | Datos del proveedor (Razón Social, CUIT). | `COD_PRO` |
| **CPA05** | Imputaciones | Detalle de facturas canceladas por la OP. | Relación con CPA04 |
| **CPA29** | Retenciones | Retenciones calculadas por Tango en la OP. | Relación con CPA04 |
| **CPA28** | Códigos de Retención | Descripción de los impuestos retenidos. | `COD_RET` (desde CPA29) |

### B. Tablas Nativas de Tango (Escritura - Módulo Tesorería)
Estas tablas reciben los datos finales tras el proceso de transferencia.

| Tabla | Descripción | Acción |
| :--- | :--- | :--- |
| **SBA04** | Encabezado Movimientos | **INSERT:** Se genera un registro aquí al confirmar el pago. |
| **SBA05** | Renglones Movimientos | **INSERT:** Detalle del egreso de fondos. |

### C. Tablas Auxiliares (Propias de la App)
Tablas que la aplicación debe crear y gestionar (`dbo.APP_...`) para manejar lógica inexistente en Tango.

1.  **`APP_OP_ESTADOS`**:
    * Maneja el ciclo de vida de la OP fuera de Tango.
    * *Columnas sugeridas:* `ID_OP_TANGO` (FK a CPA04), `ESTADO` ('PENDIENTE', 'REVISADA', 'TRANSFERIDA'), `FECHA_REVISION`, `USUARIO_REVISION`.

2.  **`APP_PADRON_RETENCIONES`**:
    * Almacena el padrón importado desde un TXT externo.
    * *Columnas sugeridas:* `CUIT`, `ALICUOTA`, `FECHA_VIGENCIA`, `TIPO_IMPUESTO`.

## 4. FLUJO FUNCIONAL (SCREENS)

### Pantalla 1: Dashboard de OPs
* **Vista:** Grilla (DataGrid) con todas las OPs emitidas en Tango (filtro `CPA04.T_COMP = 'OP'`).
* **Columnas:** Nro OP, Proveedor (`CPA01.NOM_PRO`), Fecha Emisión, Importe Total, Estado (Join con `APP_OP_ESTADOS`).
* **Lógica:** Si la OP no existe en `APP_OP_ESTADOS`, se muestra como "PENDIENTE".

### Pantalla 2: Detalle y Revisión (Auditoría)
* **Objetivo:** Validar que las retenciones calculadas por Tango coincidan con el padrón externo antes de pagar.
* **Secciones:**
    1.  **Facturas:** Listado de comprobantes que paga esta OP (`CPA05`).
    2.  **Retenciones (Validación Cruzada):**
        * Leer retención calculada (`CPA29`).
        * Leer alícuota correspondiente en `APP_PADRON_RETENCIONES` usando el CUIT del proveedor.
        * **UI:** Mostrar ambos valores lado a lado. Si difieren, resaltar en ROJO.
* **Acción:** Checkbox "Confirmar Revisión". Esto realiza un `UPSERT` en `APP_OP_ESTADOS` cambiando el estado a "REVISADA".

### Pantalla 3: Tesorería y Transferencia
* **Filtro:** Solo muestra OPs con estado "REVISADA".
* **Interacción:** Selección múltiple (Checkbox) para procesamiento por lotes.
* **Acción "PROCESAR PAGO":**
    1.  **Generación de Archivo:** Crea un TXT plano respetando la norma de diseño de **Banco Nación Argentina**.
    2.  **Escritura SQL:** Inserta el movimiento de salida de dinero en `SBA04` y `SBA05`.
    3.  **Actualización:** Cambia estado en `APP_OP_ESTADOS` a "TRANSFERIDA".

## 5. REGLAS DE NEGOCIO CRÍTICAS
1.  **Integridad Transaccional:** La generación del TXT y el INSERT en `SBA04` deben ser atómicos. Si falla SQL, no debe existir el TXT.
2.  **Validación de Padrón:** La app NO recalcula impuestos, solo *audita* comparando lo que hizo Tango vs el Padrón importado.
3.  **Usuarios:** Se utilizan los usuarios ya existentes en la base de datos de Tango para el login.

## 6. INSTRUCCIONES PARA EL ASISTENTE (IA)
* Al generar consultas SQL, prioriza la eficiencia (usa índices en `N_COMP` y `COD_PRO`).
* Al crear las tablas `APP_`, incluye scripts de creación `IF NOT EXISTS`.
* El diseño visual debe ser profesional, denso en datos (estilo Dashboard financiero) y limpio.