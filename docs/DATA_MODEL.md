# Modelo de datos — Sistema de Gestión de Proyectos de Construcción

Motor: PostgreSQL. ORM: Sequelize. Todas las tablas tienen `id` (UUID), `createdAt`, `updatedAt`.

## 1. Control de acceso (RBAC)

```
User
 - id, name, email (unique), passwordHash, active, createdAt

Role
 - id, name (admin, gerente_proyecto, residente_obra, financiero, comercial, ...)
 - description
 (configurable: se pueden crear más roles)

Permission
 - id, module (proyectos|contractual|ejecucion|ordenes_compra|personal|gastos|informes|cotizaciones|admin)
 - action (view|create|edit|delete)
 - unique(module, action)

RolePermission  (N:M Role <-> Permission)
 - roleId, permissionId

UserRole  (N:M User <-> Role)  -- un usuario puede tener varios roles
 - userId, roleId

ProjectUser  (N:M User <-> Project) -- asignación de usuarios a proyectos concretos
 - userId, projectId, roleInProject (opcional, informativo)
```

Autorización efectiva de un usuario sobre `(modulo, accion)` = unión de permisos de todos sus roles.
Para acceder a datos de un **proyecto concreto** además se exige que el usuario sea admin o esté en `ProjectUser` para ese proyecto (excepto módulos globales: Base de precios y APU).

## 2. Proyectos

```
Project
 - id, name, client, description, status (activo|suspendido|terminado|liquidado)
 - origin (manual|cotizacion)
 - quotationId (FK Quotation, nullable) -- si nace de una cotización convertida
 - createdBy (FK User), createdAt
```

## 3. Sección Contractual

```
Contract (1 proyecto puede tener 1..n contratos, normalmente 1 principal)
 - id, projectId, object, value, signedDate, endDate, filePath

Policy (pólizas, múltiples)
 - id, projectId, type (cumplimiento|responsabilidad_civil|calidad|salarios_prestaciones|...)
 - value, coverageStart, coverageEnd, filePath
```

## 4. Sección Ejecución

```
Minute / Acta (múltiples, tipadas)
 - id, projectId, type (inicio|suspension|reinicio|terminacion|final|liquidacion)
 - date, filePath (PDF)

Milestone (hitos)
 - id, projectId, name, plannedDate, actualDate, status (pendiente|cumplido|atrasado)

ProgressEntry (avance por ítem de presupuesto)
 - id, budgetItemId (FK BudgetItem), date, quantityExecuted, notes, createdBy
ProgressPhoto (1:N de ProgressEntry)
 - id, progressEntryId, filePath

PurchaseOrder
 - id, projectId, supplier, date
 - status (abierta|parcial|cerrada|cerrada_con_faltantes)
 - closureReason (obligatorio si cerrada_con_faltantes)
 - createdBy

PurchaseOrderItem
 - id, purchaseOrderId, budgetItemId (FK BudgetItem, NULLABLE -> vínculo opcional)
 - name, unit, quantityOrdered, unitPrice, totalValue (= quantityOrdered * unitPrice)

PurchaseReceipt (recepciones parciales/múltiples por ítem)
 - id, purchaseOrderItemId, date, quantityReceived, notes, createdBy
 -> al crearse, genera automáticamente un Expense (category=materiales, source=purchase_receipt)
```

Cálculos derivados (no almacenados, calculados on-the-fly):
- `deliveredQty(item) = SUM(PurchaseReceipt.quantityReceived)`
- `pendingQty(item) = quantityOrdered - deliveredQty(item)`
- Orden se puede cerrar normalmente solo si `pendingQty = 0` para todos los ítems; si no, requiere `closureReason` (cierre con faltantes).
- `% avance ítem presupuesto = SUM(ProgressEntry.quantityExecuted) / BudgetItem.quantity`
- `valor ejecutado ítem = SUM(ProgressEntry.quantityExecuted) * BudgetItem.unitCost`

## 5. Sección Personal

```
Employee
 - id, projectId, name, position, entryDate, exitDate (nullable), dedicationHours
 - salaryValue, contractFilePath
 - status (activo|retirado)

SocialSecurityDocument (afiliaciones, actualizables => múltiples versiones)
 - id, employeeId, type (salud|arl|pension), filePath, uploadDate

PaymentReceipt (comprobantes de nómina periódicos)
 - id, employeeId, date, periodLabel, amount, filePath

LaborParameters (parametrizable, versionado por fecha de vigencia)
 - id, effectiveDate, smlv, auxTransporte
 - cesantiasPercent, interesesCesantiasPercent, primaPercent, vacacionesPercent (fracciones legales,
   ej. cesantías = 1 salario/360 días trabajados, parametrizado por si cambia la ley)
 - indemnizacionRules (JSON: reglas por tipo de contrato/término)

Severance (liquidación, 1:1 con el retiro de un Employee)
 - id, employeeId, exitDate, cause (renuncia|justa_causa|sin_justa_causa|terminacion_termino)
 - laborParametersId (snapshot de qué parámetros se usaron -> auditable)
 - daysWorkedForCesantias, cesantias, interesesCesantias, prima, vacaciones, indemnizacion
 - total, breakdown (JSON detallado por concepto, con fórmula y valores usados)
 - pazYSalvoFilePath
 - createdAt
```

Al retirar un empleado (`exitDate` + `cause`) se dispara el servicio de liquidación, que:
1. Toma los `LaborParameters` vigentes a la fecha de retiro.
2. Calcula cada concepto con fórmula explícita (ver `backend/src/services/severanceService.js`).
3. Persiste el desglose completo (auditable) en `Severance.breakdown`.
4. El total se refleja como `Expense` (categoría mano_obra, source=liquidacion).
5. El empleado pasa a histórico (`status=retirado`) sin borrar ninguno de sus archivos/datos.

## 6. Sección Gastos

```
Expense
 - id, projectId, category (mano_obra|materiales|equipos|viaticos|imprevistos)
 - amount, date, description, supportFilePath
 - source (manual|purchase_receipt|liquidacion), sourceId (nullable, referencia al origen)

ExpenseBudget (presupuesto por categoría de gasto, para el consolidado presupuesto vs gasto)
 - id, projectId, category, budgetedAmount
```

## 7. Sección Informes

Sin tablas propias adicionales (excepto Riesgos); todo se calcula a partir de:
`BudgetItem + ProgressEntry` (EV, avance), `Expense` (AC), `Project`/`Milestone` (PV planeado).

```
Risk
 - id, projectId, description, impact (alto|medio|bajo), probability (alta|media|baja)
 - status (identificado|mitigado|materializado|cerrado)
```

EVM:
- `PV` (planeado) = suma acumulada de costo de línea base de BudgetItem repartido según fechas planeadas de hitos/curva definida (aproximación lineal por defecto si no hay curva explícita).
- `EV` = Σ (cantidadEjecutadaAcumulada(item) × costoUnitario(item)) — valor ganado real.
- `AC` = Σ Expense.amount (costo real).
- `CV = EV - AC`, `SV = EV - PV`, `CPI = EV/AC`, `SPI = EV/PV`.

## 8. Sección Cotizaciones

```
PriceItem (base de precios global, compartida)
 - id, type (material|mano_obra|equipo), name, unit, currentValue, updatedAt

PriceHistory
 - id, priceItemId, value, effectiveDate

APU (Análisis de Precio Unitario, global)
 - id, name (actividad/ítem de obra), unit, aiuPercent

APUComponent
 - id, apuId, priceItemId, type (material|mano_obra|equipo), yield (rendimiento/cantidad), unit
 -> directCost(apu) = Σ (component.yield * priceItem.currentValue)
 -> unitCost(apu) = directCost * (1 + aiuPercent/100)

Quotation
 - id, clientName, projectNameProposed, date, validityDays, paymentTerms
 - status (borrador|enviada|convertida)
 - convertedProjectId (FK Project, nullable)

Budget (presupuesto de obra; pertenece a una Quotation y, tras conversión, también al Project)
 - id, quotationId (nullable), projectId (nullable)
 - version, type (inicial|ajustado), createdAt

BudgetItem
 - id, budgetId, apuId, description, quantity, unit
 - unitCost (copiado del APU al momento de crear el ítem, para no alterar histórico si el APU cambia)
 - totalCost (= quantity * unitCost)
```

### Cadena de relaciones pedida
`PriceItem` (global) → `APUComponent` → `APU` (global, con AIU) → `BudgetItem` → `Budget` → `Quotation` → (conversión atómica) → `Project` (con `Budget.projectId` seteado y `Quotation.status=convertida`) → `ProgressEntry` (avance por cada `BudgetItem` del presupuesto ya asignado al proyecto).

### Conversión de cotización a proyecto (atómica)
Transacción única que:
1. Crea el `Project` (origin=cotizacion, quotationId=quotation.id).
2. Actualiza el `Budget` de la cotización: `budget.projectId = project.id` (queda como línea base del proyecto, sin duplicar datos).
3. Marca `Quotation.status = convertida`, `convertedProjectId = project.id`.
Si cualquier paso falla, se revierte todo (rollback).

---

Diagrama de alto nivel:

```
User -- UserRole -- Role -- RolePermission -- Permission
User -- ProjectUser -- Project

Project 1---1 Contract
Project 1---N Policy
Project 1---N Minute(Acta)
Project 1---N Milestone
Project 1---N PurchaseOrder 1---N PurchaseOrderItem 1---N PurchaseReceipt --> Expense
Project 1---N Employee 1---N SocialSecurityDocument
Employee 1---N PaymentReceipt
Employee 1---1 Severance
Project 1---N Expense
Project 1---N ExpenseBudget
Project 1---N Risk

PriceItem 1---N PriceHistory
PriceItem 1---N APUComponent N---1 APU
APU 1---N BudgetItem N---1 Budget
Budget N---1 Quotation (nullable)     Budget N---1 Project (nullable, seteado tras conversión)
Quotation 1---1 Project (tras conversión)
BudgetItem 1---N ProgressEntry 1---N ProgressPhoto
```
