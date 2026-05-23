# Instrucciones para la Fase de Prueba

Para que el cliente pueda probar la aplicación en su PC, solo se deben seguir estos tres pasos:

## 1. Copiar la Carpeta
Copiar toda la carpeta del proyecto (`finance-portal...`) a la PC del cliente.

## 2. Requisitos Previos
Asegurarse de que el cliente tenga instalado **Node.js** (se requiere para ejecutar los servidores).

*(Nota: si es la primera vez que se va a correr en esa PC, tal vez sea necesario abrir una consola en la carpeta del proyecto y ejecutar `npm install` para asegurar que las dependencias estén presentes).*

## 3. Iniciar la Aplicación
Para levantar todo (Frontend y Backend al mismo tiempo), el cliente solo debe hacer **doble clic** en el archivo:
🚀 `iniciar-prueba.bat`

Este archivo abrirá dos ventanas de consola (una para el servidor Backend y otra para el Frontend en desarrollo).

---

### Detalles Técnicos de la Prueba:
- **Base de Datos:** El archivo `.env` ya fue configurado con `DB_DATABASE=PRUEBA`. Todas las operaciones se harán contra esa base de datos y no afectarán a `CENTRAL`.
- **Emails:** El archivo `.env` continúa con la variable `TEST_EMAIL_RECIPIENT=rivadeneirag@hotmail.com`. Esto garantiza que, durante la prueba, **absolutamente todos** los emails de comprobantes de órdenes de pago irán a esa dirección, sin importar el proveedor real.
