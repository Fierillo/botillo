# Botillo
Simple Discord/Telegram bot that returns the latest daily HIGH/LOW price of Bitcoin.
## Installation:
### Windows
<details>

First, you need to install the dependencies.

Install Node.js (LTS) from the official website:

https://nodejs.org/en/download/

Now install Git:

https://git-scm.com/download/win

Then, install pnpm (using PowerShell as administrator):
```
npm install -g pnpm
```
Here you go! You can now clone the repository and install the dependencies:
```
git clone https://github.com/Fierillo/botillo
cd botillo
pnpm i
```
All done! now run the bot:
```
pnpm start
```
</details>

### Linux
<details>

Install the dependencies:

```
sudo apt update
sudo apt install nodejs npm
sudo apt install git
npm install -g pnpm
```
Now clone the repository and install the dependencies:
```
git clone https://github.com/Fierillo/botillo
cd botillo
pnpm i
```
All done! now run the bot:
```
pnpm start
```
</details>

### MacOS
<details>
Install the dependencies:

```
brew install node
brew install git
npm install -g pnpm
```
Now clone the repository and install the dependencies:
```
git clone https://github.com/Fierillo/botillo
cd botillo
pnpm i
```
All done! now run the bot:
```
pnpm start
```
</details>

## Lógica de pago

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
