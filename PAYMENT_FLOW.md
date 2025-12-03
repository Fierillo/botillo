# Payment Flow - NWC

## Flujo completo

```
/prodillo 150000
    ↓
createInvoice(21 sats, userId)
    ↓ [NWC]
Retorna: { bolt11, invoiceId, paymentHash }
    ↓
Guarda en:
  • pendingProdillos.json (con invoiceId)
  • invoicesCache.json (con paymentHash)
    ↓
Envía QR al usuario por DM
    ↓ [Usuario paga]
NWC registra transacción
    ↓
Payment Checker (cada 10s):
  • Lee pendingProdillos.json
  • Obtiene paymentHash del caché
  • Llama NWC.listTransactions()
  • Busca: payment_hash MATCH + state="settled"
    ↓
✅ Encontrado
    ↓
  • Agrega a prodillos.json
  • Envía confirmación (chat + DM)
  • Elimina de pending
  • Marca paidAt en caché
```

## Identificación única: payment_hash

Cada invoice tiene un `payment_hash` único (generado por NWC):
- ✅ Nunca se repite
- ✅ Permite matching preciso 1:1
- ✅ No confunde con múltiples invoices del mismo usuario

```
Invoice 1: payment_hash=abc123... → Crea prodillo
Invoice 2: payment_hash=xyz789... → Crea otro prodillo
```

## Archivos

| Archivo | Propósito | Clave | Valor |
|---------|-----------|-------|-------|
| `pendingProdillos.json` | Esperando pago | userId | { user, predict, chatId, invoiceId } |
| `invoicesCache.json` | Detalles de invoices | invoiceId | { invoiceId, bolt11, description, paymentHash, amount, paidAt? } |
| `prodillos.json` | Confirmados | userId | { user, predict } |

## Verificación robusta

**Antes:** Buscaba por `description + amount` → Falsos positivos ❌

**Ahora:** Busca por `payment_hash` único → Preciso ✅

```javascript
// ANTES (débil)
find(t => t.description === desc && t.amount === amt && t.state === 'settled')

// AHORA (robusto)
find(t => t.payment_hash === hash && t.state === 'settled')
```
