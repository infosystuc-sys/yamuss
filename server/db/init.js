

/**
 * Inicializa la base de datos verificando y creando tablas necesarias.
 * Ejecuta lógica idempotente para no afectar datos existentes en producción.
 */
export async function initializeDatabase(adapter) {
    console.log(`Verificando base de datos (${adapter.type})...`);

    try {
        const isSqlite = adapter.type === 'sqlite';

        // Helper para tipos de datos
        const T = {
            string: (n) => isSqlite ? 'TEXT' : `VARCHAR(${n})`,
            pk_identity: () => isSqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT IDENTITY(1,1) PRIMARY KEY',
            datetime: () => isSqlite ? 'TEXT' : 'DATETIME',
            decimal: (p, s) => isSqlite ? 'REAL' : `DECIMAL(${p},${s})`,
            default_now: () => isSqlite ? "DEFAULT (datetime('now','localtime'))" : 'DEFAULT GETDATE()'
        };

        // =========================================================================
        // ESCENARIO A: Tablas Propias (Prefijo APP_)
        // =========================================================================

        // 1. Tabla APP_OP_ESTADOS (crear solo si no existe — NO borrar datos al reiniciar)
        if (isSqlite) {
            const existsSqlite = await adapter.query("SELECT name FROM sqlite_master WHERE type='table' AND name='APP_OP_ESTADOS'");
            if (existsSqlite.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE APP_OP_ESTADOS (
                        N_COMP TEXT PRIMARY KEY, 
                        ESTADO TEXT NOT NULL DEFAULT 'Pendiente', 
                        FECHA_MODIFICACION TEXT ${T.default_now()},
                        USUARIO_MODIFICACION TEXT
                    );
                `);
            }
        } else {
            const existsMssql = await adapter.query("SELECT * FROM sys.tables WHERE name = 'APP_OP_ESTADOS'");
            if (existsMssql.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE APP_OP_ESTADOS (
                        N_COMP VARCHAR(50) PRIMARY KEY, 
                        ESTADO VARCHAR(20) NOT NULL DEFAULT 'Pendiente', 
                        FECHA_MODIFICACION DATETIME DEFAULT GETDATE(),
                        USUARIO_MODIFICACION VARCHAR(50)
                    );
                `);
            }
        }
        console.log('Tabla APP_OP_ESTADOS verificada.');

        // 2. Tabla APP_PADRON_RETENCIONES
        if (isSqlite) {
            await adapter.query("DROP TABLE IF EXISTS APP_PADRON_RETENCIONES");
            await adapter.query(`
                CREATE TABLE APP_PADRON_RETENCIONES (
                    CUIT TEXT PRIMARY KEY,
                    ALICUOTA REAL,
                    VIGENCIA_DESDE TEXT,
                    VIGENCIA_HASTA TEXT,
                    FECHA_IMPORTACION TEXT ${T.default_now()}
                );
            `);
        } else {
            await adapter.query(`
                IF EXISTS (SELECT * FROM sys.tables WHERE name = 'APP_PADRON_RETENCIONES') DROP TABLE APP_PADRON_RETENCIONES;
                CREATE TABLE APP_PADRON_RETENCIONES (
                    CUIT VARCHAR(13) PRIMARY KEY,
                    ALICUOTA DECIMAL(5, 2),
                    VIGENCIA_DESDE DATE,
                    VIGENCIA_HASTA DATE,
                    FECHA_IMPORTACION DATETIME DEFAULT GETDATE()
                );
            `);
        }
        console.log('Tabla APP_PADRON_RETENCIONES verificada.');

        // 2b. Tabla PADRON_RENTAS (Nueva tabla solicitada)
        if (isSqlite) {
            await adapter.query("DROP TABLE IF EXISTS PADRON_RENTAS");
            await adapter.query(`
                CREATE TABLE PADRON_RENTAS (
                    CUIT TEXT PRIMARY KEY,
                    EXENTO TEXT,
                    CONVENIO TEXT,
                    DENOMINACION TEXT,
                    PORCENTAJE REAL,
                    FECHA_IMPORTACION TEXT ${T.default_now()}
                );
            `);
        } else {
            // Check if table exists
            const checkTable = await adapter.query("SELECT * FROM sys.tables WHERE name = 'PADRON_RENTAS'");
            if (checkTable.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE PADRON_RENTAS (
                        CUIT VARCHAR(11) PRIMARY KEY,
                        EXENTO CHAR(1),
                        CONVENIO VARCHAR(2),
                        DENOMINACION VARCHAR(200),
                        PORCENTAJE DECIMAL(9, 3),
                        PERIODO VARCHAR(7) NULL,
                        FECHA_IMPORTACION DATETIME DEFAULT GETDATE()
                    );
                `);
            } else {
                // Check if column exists
                const checkCol = await adapter.query("SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PADRON_RENTAS') AND name = 'FECHA_IMPORTACION'");
                if (checkCol.recordset.length === 0) {
                    await adapter.query("ALTER TABLE PADRON_RENTAS ADD FECHA_IMPORTACION DATETIME DEFAULT GETDATE()");
                }
            }
        }
        console.log('Tabla PADRON_RENTAS verificada.');

        // 2c. Tabla PADRON_TEM
        if (isSqlite) {
            await adapter.query('DROP TABLE IF EXISTS PADRON_TEM');
            await adapter.query(`
                CREATE TABLE PADRON_TEM (
                    CUIT TEXT PRIMARY KEY,
                    NOMBRE TEXT NOT NULL,
                    PERIODO TEXT,
                    FECHA_IMPORTACION TEXT ${T.default_now()}
                );
            `);
        } else {
            const checkTEM = await adapter.query("SELECT * FROM sys.tables WHERE name = 'PADRON_TEM'");
            if (checkTEM.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE PADRON_TEM (
                        CUIT              VARCHAR(11)  NOT NULL,
                        NOMBRE            VARCHAR(50)  NOT NULL,
                        PERIODO           VARCHAR(7)   NULL,
                        FECHA_IMPORTACION DATETIME     DEFAULT GETDATE(),
                        CONSTRAINT PK_PADRON_TEM PRIMARY KEY (CUIT)
                    );
                    CREATE INDEX IX_PADRON_TEM_PERIODO ON PADRON_TEM (PERIODO);
                `);
            }
        }
        console.log('Tabla PADRON_TEM verificada.');

        // 3. Tablas ROLES, USUARIOS y APP_USUARIOS (legacy)
        if (isSqlite) {
            // --- ROLES ---
            const rolesRes = await adapter.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ROLES'");
            if (rolesRes.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE ROLES (
                        ID INTEGER PRIMARY KEY AUTOINCREMENT,
                        Nombre TEXT NOT NULL UNIQUE,
                        Descripcion TEXT
                    );
                `);
                await adapter.query(`INSERT INTO ROLES (Nombre, Descripcion) VALUES ('ADMINISTRADOR', 'Acceso completo a toda la aplicación')`);
                await adapter.query(`INSERT INTO ROLES (Nombre, Descripcion) VALUES ('OPERADOR', 'Dashboard, ver PDF, importar padrón')`);
            }

            // --- USUARIOS ---
            const usuRes = await adapter.query("SELECT name FROM sqlite_master WHERE type='table' AND name='USUARIOS'");
            if (usuRes.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE USUARIOS (
                        ID INTEGER PRIMARY KEY AUTOINCREMENT,
                        Usuario TEXT NOT NULL UNIQUE,
                        Password TEXT NOT NULL DEFAULT '1234',
                        RolId INTEGER NOT NULL,
                        PrimerLogin INTEGER NOT NULL DEFAULT 1,
                        Activo INTEGER NOT NULL DEFAULT 1,
                        FechaCreacion TEXT DEFAULT (datetime('now','localtime'))
                    );
                `);
                await adapter.query(`
                    INSERT INTO USUARIOS (Usuario, Password, RolId, PrimerLogin, Activo)
                    SELECT 'ADMIN', 'admin', ID, 0, 1 FROM ROLES WHERE Nombre = 'ADMINISTRADOR'
                `);
            }

            // --- APP_USUARIOS legacy (recrear si columna Usuario no existe) ---
            const res = await adapter.query("SELECT name FROM sqlite_master WHERE type='table' AND name='APP_USUARIOS'");
            if (res.recordset.length > 0) {
                const cols = await adapter.query("PRAGMA table_info(APP_USUARIOS)");
                const hasUsuarioCol = (cols.recordset || []).some(c => c.name === 'Usuario');
                if (!hasUsuarioCol) {
                    await adapter.query("DROP TABLE APP_USUARIOS");
                }
            }

            const res2 = await adapter.query("SELECT name FROM sqlite_master WHERE type='table' AND name='APP_USUARIOS'");
            if (res2.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE APP_USUARIOS (
                        Usuario TEXT PRIMARY KEY,
                        Password TEXT NOT NULL,
                        Rol TEXT NOT NULL DEFAULT 'REVISION'
                    );
                `);
            }
            // APP_LOTES (en BD maestra para persistir entre reinicios)
            const loteRes = await adapter.query("SELECT name FROM sqlite_master WHERE type='table' AND name='APP_LOTES'");
            if (loteRes.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE APP_LOTES (
                        ID INTEGER PRIMARY KEY AUTOINCREMENT,
                        [DATABASE] TEXT DEFAULT 'CENTRAL',
                        FECHA_CREACION TEXT ${T.default_now()},
                        CANTIDAD_OPS INTEGER,
                        MONTO_TOTAL REAL,
                        NOMBRE_ARCHIVO TEXT
                    );
                 `);
                await adapter.query(`
                    CREATE TABLE APP_LOTES_DETALLE (
                        ID INTEGER PRIMARY KEY AUTOINCREMENT,
                        LOTE_ID INTEGER,
                        N_COMP_OP TEXT,
                        N_COMP TEXT,
                        PROVEEDOR TEXT,
                        MONTO_PAGO REAL
                    );
                 `);
            } else {
                const colsLote = await adapter.query("PRAGMA table_info(APP_LOTES)");
                const hasDbCol = (colsLote.recordset || []).some(c => c.name === 'DATABASE');
                if (!hasDbCol) await adapter.query("ALTER TABLE APP_LOTES ADD COLUMN [DATABASE] TEXT DEFAULT 'CENTRAL'");
                const colsDet = await adapter.query("PRAGMA table_info(APP_LOTES_DETALLE)");
                const namesDet = (colsDet.recordset || []).map(c => c.name);
                if (!namesDet.includes('N_COMP')) await adapter.query("ALTER TABLE APP_LOTES_DETALLE ADD COLUMN N_COMP TEXT");
                if (!namesDet.includes('PROVEEDOR')) await adapter.query("ALTER TABLE APP_LOTES_DETALLE ADD COLUMN PROVEEDOR TEXT");
                if (!namesDet.includes('MONTO_PAGO')) await adapter.query("ALTER TABLE APP_LOTES_DETALLE ADD COLUMN MONTO_PAGO REAL");
            }

        } else {
            // --- ROLES (SQL Server) ---
            const rolesRes = await adapter.query("SELECT * FROM sys.tables WHERE name = 'ROLES'");
            if (rolesRes.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE ROLES (
                        ID INT IDENTITY(1,1) PRIMARY KEY,
                        Nombre VARCHAR(30) NOT NULL,
                        Descripcion VARCHAR(100)
                    );
                    INSERT INTO ROLES (Nombre, Descripcion) VALUES ('ADMINISTRADOR', 'Acceso completo a toda la aplicación');
                    INSERT INTO ROLES (Nombre, Descripcion) VALUES ('OPERADOR', 'Dashboard, ver PDF, importar padrón');
                `);
                console.log('Tabla ROLES creada en SQL Server.');
            }

            // --- USUARIOS (SQL Server) ---
            const usuRes = await adapter.query("SELECT * FROM sys.tables WHERE name = 'USUARIOS'");
            if (usuRes.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE USUARIOS (
                        ID INT IDENTITY(1,1) PRIMARY KEY,
                        Usuario VARCHAR(50) NOT NULL UNIQUE,
                        Password VARCHAR(255) NOT NULL DEFAULT '1234',
                        RolId INT NOT NULL,
                        PrimerLogin BIT NOT NULL DEFAULT 1,
                        Activo BIT NOT NULL DEFAULT 1,
                        FechaCreacion DATETIME DEFAULT GETDATE()
                    );
                `);
                await adapter.query(`
                    INSERT INTO USUARIOS (Usuario, Password, RolId, PrimerLogin, Activo)
                    SELECT 'ADMIN', 'admin', ID, 0, 1 FROM ROLES WHERE Nombre = 'ADMINISTRADOR'
                `);
                console.log('Tabla USUARIOS creada en SQL Server con usuario ADMIN.');
            }

            // --- APP_USUARIOS legacy (SQL Server) ---
            const res = await adapter.query("SELECT * FROM sys.tables WHERE name = 'APP_USUARIOS'");
            if (res.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE APP_USUARIOS (
                        Usuario VARCHAR(50) PRIMARY KEY,
                        Password VARCHAR(255) NOT NULL,
                        Rol VARCHAR(30) NOT NULL DEFAULT 'REVISION'
                    );
                `);
                console.log('Tabla APP_USUARIOS creada en SQL Server.');
            }

            // APP_LOTES (en BD maestra CENTRAL para persistir entre reinicios)
            const loteRes = await adapter.query("SELECT * FROM sys.tables WHERE name = 'APP_LOTES'");
            if (loteRes.recordset.length === 0) {
                await adapter.query(`
                    CREATE TABLE APP_LOTES (
                        ID INT IDENTITY(1,1) PRIMARY KEY,
                        [DATABASE] VARCHAR(50) DEFAULT 'CENTRAL',
                        FECHA_CREACION DATETIME DEFAULT GETDATE(),
                        CANTIDAD_OPS INT,
                        MONTO_TOTAL DECIMAL(18, 2),
                        NOMBRE_ARCHIVO VARCHAR(255)
                    );
                 `);
                await adapter.query(`
                    CREATE TABLE APP_LOTES_DETALLE (
                        ID INT IDENTITY(1,1) PRIMARY KEY,
                        LOTE_ID INT,
                        N_COMP_OP VARCHAR(15),
                        N_COMP VARCHAR(15),
                        PROVEEDOR VARCHAR(200),
                        MONTO_PAGO DECIMAL(18, 2)
                    );
                 `);
            } else {
                try {
                    const colDb = await adapter.query("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('APP_LOTES') AND name = 'DATABASE'");
                    if (colDb.recordset.length === 0) await adapter.query("ALTER TABLE APP_LOTES ADD [DATABASE] VARCHAR(50) DEFAULT 'CENTRAL'");
                    const cols = await adapter.query("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('APP_LOTES_DETALLE') AND name IN ('N_COMP', 'PROVEEDOR', 'MONTO_PAGO')");
                    const names = (cols.recordset || []).map(c => c.name);
                    if (!names.includes('N_COMP')) await adapter.query("ALTER TABLE APP_LOTES_DETALLE ADD N_COMP VARCHAR(15)");
                    if (!names.includes('PROVEEDOR')) await adapter.query("ALTER TABLE APP_LOTES_DETALLE ADD PROVEEDOR VARCHAR(200)");
                    if (!names.includes('MONTO_PAGO')) await adapter.query("ALTER TABLE APP_LOTES_DETALLE ADD MONTO_PAGO DECIMAL(18, 2)");
                } catch (_) { }
            }
        }
        console.log('Tabla APP_USUARIOS verificada.');

        // Verificar seed de USUARIOS (tabla nueva)
        const checkNewUsers = await adapter.query("SELECT COUNT(*) as count FROM USUARIOS");
        const newCount = checkNewUsers.recordset[0].count;
        if (newCount === 0) {
            if (isSqlite) {
                await adapter.query(`
                    INSERT INTO USUARIOS (Usuario, Password, RolId, PrimerLogin, Activo)
                    SELECT 'ADMIN', 'admin', ID, 0, 1 FROM ROLES WHERE Nombre = 'ADMINISTRADOR'
                `);
            } else {
                await adapter.query(`
                    INSERT INTO USUARIOS (Usuario, Password, RolId, PrimerLogin, Activo)
                    SELECT 'ADMIN', 'admin', ID, 0, 1 FROM ROLES WHERE Nombre = 'ADMINISTRADOR'
                `);
            }
            console.log('Usuario seed ADMIN insertado en USUARIOS.');
        }

        // Seed de APP_USUARIOS legacy (si está vacía)
        const checkUsers = await adapter.query("SELECT COUNT(*) as count FROM APP_USUARIOS");
        const count = checkUsers.recordset[0].count;
        if (count === 0) {
            const seedUsers = [
                { Usuario: 'SUPERVISOR', Password: 'admin', Rol: 'SUPERVISOR' },
                { Usuario: 'ADMINISTRATIVO', Password: '1234', Rol: 'ADMINISTRATIVO' },
                { Usuario: 'REVISION', Password: '1234', Rol: 'REVISION' },
                { Usuario: 'TRANSFERENCIA', Password: '1234', Rol: 'TRANSFERENCIA' },
            ];
            for (const u of seedUsers) {
                if (isSqlite) {
                    await adapter.query(`INSERT INTO APP_USUARIOS (Usuario, Password, Rol) VALUES ('${u.Usuario}', '${u.Password}', '${u.Rol}')`);
                } else {
                    await adapter.query(`
                        IF NOT EXISTS (SELECT 1 FROM APP_USUARIOS WHERE Usuario = '${u.Usuario}')
                            INSERT INTO APP_USUARIOS (Usuario, Password, Rol) VALUES ('${u.Usuario}', '${u.Password}', '${u.Rol}')
                    `);
                }
            }
        }

        // =========================================================================
        // ESCENARIO B: Tablas Tango (Prefijos CPA_, SBA_, etc.)
        // =========================================================================

        let tablesExist = false;
        if (isSqlite) {
            const res = await adapter.query("SELECT name FROM sqlite_master WHERE type='table' AND name='CPA04'");
            tablesExist = res.recordset.length > 0;
        } else {
            const res = await adapter.query("SELECT COUNT(*) as count FROM sys.tables WHERE name IN ('CPA04', 'CPA01')");
            tablesExist = res.recordset[0].count > 0;
        }

        if (!tablesExist) {
            console.log(`Entorno detectado: Desarrollo (${isSqlite ? 'SQLite' : 'SQL Server Mock'}).`);
            console.log("Creando tablas simuladas...");

            // Helper para ejecutar lote de queries (SQLite no soporta multiples statements en una llamada via adapter a veces)
            const runQuery = async (q) => await adapter.query(q);

            // MOCK 1: CPA01
            if (isSqlite) await runQuery("DROP TABLE IF EXISTS CPA01");
            await runQuery(`
                CREATE TABLE CPA01 (
                    COD_PROVEE ${T.string(15)} PRIMARY KEY,
                    NOM_PROVEE ${T.string(60)},
                    N_CUIT ${T.string(13)},
                    CBU ${T.string(22)}
                );
            `);
            await runQuery(`INSERT INTO CPA01 (COD_PROVEE, NOM_PROVEE, N_CUIT, CBU) VALUES ('PROV01', 'EMPRESA EJEMPLO S.A.', '30-11223344-5', '0110000000000000000022')`);
            await runQuery(`INSERT INTO CPA01 (COD_PROVEE, NOM_PROVEE, N_CUIT, CBU) VALUES ('PROV02', 'SERVICIOS IT SRL', '33-55667788-9', '0170000000000000000033')`);

            // MOCK 2: CPA04
            // Nota: SQLite datetime functions son diferentes, el insert debe ser limpio
            if (isSqlite) await runQuery("DROP TABLE IF EXISTS CPA04");
            await runQuery(`
                CREATE TABLE CPA04 (
                    N_COMP ${T.string(15)} PRIMARY KEY,
                    COD_PROVEE ${T.string(15)},
                    FECHA_EMIS ${T.datetime()},
                    IMPORTE_TO ${T.decimal(18, 2)},
                    T_COMP ${T.string(3)} DEFAULT 'O/P',
                    ESTADO ${T.string(3)} DEFAULT ' '
                );
            `);
            // Inserts con fechas compatibles
            const dateFn = isSqlite ? "datetime('now')" : "GETDATE()";
            const dateFnPrev = isSqlite ? "datetime('now', '-1 day')" : "DATEADD(day, -1, GETDATE())";

            await runQuery(`INSERT INTO CPA04 (N_COMP, COD_PROVEE, FECHA_EMIS, IMPORTE_TO) VALUES ('OP-0001', 'PROV01', ${dateFn}, 15000.00)`);
            await runQuery(`INSERT INTO CPA04 (N_COMP, COD_PROVEE, FECHA_EMIS, IMPORTE_TO) VALUES ('OP-0002', 'PROV02', ${dateFn}, 5000.50)`);
            await runQuery(`INSERT INTO CPA04 (N_COMP, COD_PROVEE, FECHA_EMIS, IMPORTE_TO) VALUES ('OP-0003', 'PROV01', ${dateFnPrev}, 25000.00)`);

            // MOCK 3: CPA05
            if (isSqlite) await runQuery("DROP TABLE IF EXISTS CPA05");
            await runQuery(`
                CREATE TABLE CPA05 (
                    ID ${T.pk_identity()},
                    N_COMP_CAN ${T.string(15)},
                    N_COMP_FAC ${T.string(15)},
                    T_COMP_FAC ${T.string(3)},
                    IMPORT_CAN ${T.decimal(18, 2)}
                );
            `);
            await runQuery(`INSERT INTO CPA05 (N_COMP_CAN, N_COMP_FAC, T_COMP_FAC, IMPORT_CAN) VALUES ('OP-0001', 'FC-A-0001', 'FAC', 10000.00)`);
            await runQuery(`INSERT INTO CPA05 (N_COMP_CAN, N_COMP_FAC, T_COMP_FAC, IMPORT_CAN) VALUES ('OP-0001', 'FC-A-0002', 'FAC', 5000.00)`);

            // MOCK 4: CPA28/29
            if (isSqlite) await runQuery("DROP TABLE IF EXISTS CPA28");
            await runQuery(`CREATE TABLE CPA28 (COD_RETEN ${T.string(5)} PRIMARY KEY, DESCRIPCIO ${T.string(50)})`);
            await runQuery(`INSERT INTO CPA28 VALUES ('10', 'RETENCION IIBB')`);
            await runQuery(`INSERT INTO CPA28 VALUES ('20', 'GANANCIAS')`);

            if (isSqlite) await runQuery("DROP TABLE IF EXISTS CPA29");
            await runQuery(`
                CREATE TABLE CPA29 (
                    ID ${T.pk_identity()},
                    N_COMP ${T.string(15)},
                    COD_RETEN ${T.string(5)},
                    IMP_RETEN ${T.decimal(18, 2)},
                    PORCENTAJE_RETENCION ${T.decimal(5, 2)},
                    BASE_CALCULO ${T.decimal(18, 2)}
                );
            `);

            // MOCK 6: RETENCION_COMPRAS / RETENCION_COMPRAS_ESCALA (Configuración)
            if (isSqlite) {
                await runQuery("DROP TABLE IF EXISTS RETENCION_COMPRAS");
                await runQuery("DROP TABLE IF EXISTS RETENCION_COMPRAS_ESCALA");
            }

            if (isSqlite) {
                await runQuery(`
                    CREATE TABLE RETENCION_COMPRAS (
                        ID_RETENCION_COMPRAS ${isSqlite ? 'INTEGER PRIMARY KEY' : 'INT PRIMARY KEY'},
                        COD_RETEN ${T.string(5)}
                    );
                 `);
                await runQuery(`
                    CREATE TABLE RETENCION_COMPRAS_ESCALA (
                        ID_RETENCION_COMPRAS_ESCALA ${isSqlite ? 'INTEGER PRIMARY KEY' : 'INT IDENTITY(1,1) PRIMARY KEY'},
                        ID_RETENCION_COMPRAS INT,
                        MINIMO_BASE_CALCULO ${T.decimal(18, 2)}
                    );
                 `);

                // Insert Mock Config
                // COD_RETEN '10' (IIBB) -> ID 100 -> Minimo 20000
                await runQuery(`INSERT INTO RETENCION_COMPRAS (ID_RETENCION_COMPRAS, COD_RETEN) VALUES (100, '10')`);
                await runQuery(`INSERT INTO RETENCION_COMPRAS_ESCALA (ID_RETENCION_COMPRAS, MINIMO_BASE_CALCULO) VALUES (100, 20000.00)`);
            } else {
                // Check if tables exist logic for SQL Server handled dynamically or lazily
                // For now, simpler to assume we can create if not exists
                const checkM = await adapter.query("SELECT * FROM sys.tables WHERE name = 'RETENCION_COMPRAS'");
                if (checkM.recordset.length === 0) {
                    await runQuery(`CREATE TABLE RETENCION_COMPRAS (ID_RETENCION_COMPRAS INT PRIMARY KEY, COD_RETEN VARCHAR(5))`);
                    await runQuery(`CREATE TABLE RETENCION_COMPRAS_ESCALA (ID_RETENCION_COMPRAS_ESCALA INT IDENTITY(1,1) PRIMARY KEY, ID_RETENCION_COMPRAS INT, MINIMO_BASE_CALCULO DECIMAL(18,2))`);
                    await runQuery(`INSERT INTO RETENCION_COMPRAS (ID_RETENCION_COMPRAS, COD_RETEN) VALUES (100, '10')`);
                    await runQuery(`INSERT INTO RETENCION_COMPRAS_ESCALA (ID_RETENCION_COMPRAS, MINIMO_BASE_CALCULO) VALUES (100, 20000.00)`);
                }
            }

            // MOCK 5: Tesorería
            if (isSqlite) await runQuery("DROP TABLE IF EXISTS SBA04");
            await runQuery(`
                CREATE TABLE SBA04 (
                    ID_SBA04 ${T.pk_identity()},
                    ID_SBA02 INT,
                    N_COMP ${T.string(15)},
                    FECHA ${T.datetime()},
                    COTIZACION ${T.decimal(10, 4)},
                    TOTAL_IMPORTE_CTE ${T.decimal(18, 2)},
                    COD_COMP ${T.string(3)},
                    OBSERVACIONES ${T.string(255)}
                );
            `);

            if (isSqlite) await runQuery("DROP TABLE IF EXISTS SBA05");
            await runQuery(`
                CREATE TABLE SBA05 (
                    ID_SBA05 ${T.pk_identity()},
                    ID_SBA02 INT,
                    N_COMP ${T.string(15)},
                    RENGLON INT,
                    COD_CTA ${T.string(15)},
                    D_H ${T.string(1)},
                    MONTO ${T.decimal(18, 2)},
                    COTIZ_MONE ${T.decimal(10, 4)},
                    LEYENDA ${T.string(100)}
                );
            `);

            console.log("Tablas simuladas creadas correctamente.");
        }

    } catch (error) {
        console.error("Error CRÍTICO al inicializar DB:", error);
        throw error;
    }
}
