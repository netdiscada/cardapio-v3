# Cardapio Quatinga - Cloud Functions para Notificações Push

## Estrutura criada

```
functions/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

## O que cada Function faz

### 1. `onNewCardapio` (Firestore trigger)
- Dispara quando **novo documento em `cardapioSemana`** é criado
- Se tem `nextMenuImageBase64` → "Próxima Semana" (tópico `funcionarios`)
- Senão → "Semana Atual" (tópico `funcionarios`)
- Também envia para tokens individuais (fallback)

### 2. `onNewOrder` (Firestore trigger)
- Dispara quando **novo documento em `pedidosDaSemana`** é criado
- Só notifica admin se `isNextWeek == true` (pedido antecipado)
- Envia para tokens com `role: "admin"`

### 3. `dailyCheckAllOrdered` (PubSub schedule)
- Roda **todo dia útil às 10:00 (BRT)**
- Conta funcionários ativos vs pedidos da semana atual (`isNextWeek == false`)
- Se **todos pediram** → notifica admin "✅ Todos já escolheram!"
- (Opcional) Lembra os que faltam - código comentado

### 4. `cleanupInactiveTokens` (PubSub schedule)
- Domingos 03:00 BRT
- Marca como `active: false` tokens sem atualização há 30+ dias

## Estrutura de dados esperada no Firestore

### `deviceTokens` (coleção)
```
doc = FCM token (string)
{
  token: string,      // mesmo que o doc ID
  rgf: string,        // RGF do funcionário
  role: "funcionario" | "admin",
  active: boolean,
  updatedAt: Timestamp,
  platform: "android" | "ios" | "web"
}
```

### `funcionarios` (coleção)
```
doc = RGF (string)
{
  nome: string,
  ativo: boolean,
  ...outros campos
}
```

### `cardapioSemana` (documento único)
```
{
  menuImageBase64: string,      // semana atual
  nextMenuImageBase64: string,  // próxima semana (opcional)
  holidays: string[],
  nextHolidays: string[],
  targetRotationDate: Timestamp
}
```

### `pedidosDaSemana` (coleção)
```
doc = auto-id
{
  employeeRGF: string,
  employeeName: string,
  isNextWeek: boolean,
  timestamp: Timestamp,
  segundafeira: string,
  tercafeira: string,
  ...
}
```

## Como fazer o deploy (você roda no seu terminal)

```bash
# 1. Entre na pasta do projeto Firebase (onde tem firebase.json)
cd /caminho/do/seu/projeto-firebase

# 2. Copie a pasta functions/ para lá (ou crie functions/ e cole os arquivos)
#    Deve ficar: seu-projeto/functions/package.json, functions/tsconfig.json, functions/src/index.ts

# 3. Instale dependências
cd functions
npm install

# 4. Build TypeScript
npm run build

# 5. Deploy (precisa estar logado: firebase login)
firebase deploy --only functions
```

## No App (Android) - já preparado no APK

O APK já tem o plugin `@capacitor/push-notifications@6.0.5`. Para registrar o token:

```javascript
// No app.js ou onde inicializa o Capacitor
import { PushNotifications } from '@capacitor/push-notifications';

// Ao logar (já tem RGF do usuário)
async function registerPushToken(rgf: string, role: 'funcionario' | 'admin') {
  // Permissão (Android 13+)
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  // Registro
  await PushNotifications.register();

  // Listener do token
  PushNotifications.addListener('registration', async (token) => {
    // Salva no Firestore
    await db.collection('deviceTokens').doc(token.value).set({
      token: token.value,
      rgf,
      role,
      active: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      platform: 'android'
    }, { merge: true });
  });

  // Atualiza token se mudar
  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error:', err);
  });
}

// Chame após login bem-sucedido:
// registerPushToken(userRGF, isAdmin ? 'admin' : 'funcionario');
```

## Topics FCM (auto-subscription)

O app pode se inscrever nos tópicos:
```javascript
await PushNotifications.addListener('registration', (token) => {
  // Subscribe to topics after getting token
  // (Capacitor PushNotifications não tem API de topics direta,
  //  use Firebase Admin SDK no backend ou chame a REST API)
});
```
Ou o backend faz a subscrição em lote via Admin SDK:
```javascript
await admin.messaging().subscribeToTopic(tokensArray, 'funcionarios');
```

## Custos
- **FCM**: Gratuito ilimitado
- **Cloud Functions**: Tier grátis = 2M invocações/mês, 400k GB-seg, 5GB egresso
- Este uso (~4 functions/dia + triggers) <<< tier grátis

## Testar localmente (opcional)
```bash
cd functions
npm run serve  # Inicia emulador
# Teste via Firebase Console ou curl nos endpoints HTTP (se houver)
```