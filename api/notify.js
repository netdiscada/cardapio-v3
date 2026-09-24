// Vercel Serverless Function: Cardapio Quatinga Push Notifications
// Roda gratuitamente na Vercel (sem plano Blaze no Firebase)

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Inicializa Firebase Admin (usando env vars da Vercel)
if (!getApps().length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  } else {
    // Fallback para ambiente de teste ou projeto padrão
    initializeApp();
  }
}

const db = getFirestore();
const messaging = getMessaging();

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, title, body, role, targetRGF, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Missing title or body' });
    }

    // Busca tokens no Firestore
    let tokensQuery = db.collection('deviceTokens').where('active', '==', true);
    if (role) {
      tokensQuery = tokensQuery.where('role', '==', role);
    }
    if (targetRGF) {
      tokensQuery = tokensQuery.where('rgf', '==', targetRGF);
    }

    const snap = await tokensQuery.get();
    const tokens = snap.docs.map(d => d.id);

    if (tokens.length === 0) {
      return res.status(200).json({ success: true, message: 'No active device tokens found', sentCount: 0 });
    }

    // Envia FCM multicast
    const message = {
      tokens,
      notification: { title, body },
      data: data || {},
      android: {
        priority: 'high',
        notification: {
          channelId: 'cardapio_notifications',
          icon: 'ic_notification',
          color: '#2563EB',
        },
      },
    };

    const response = await messaging.sendEachForMulticast(message);

    // Remove tokens inválidos
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const err = resp.error;
          if (err && (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered')) {
            failedTokens.push(tokens[idx]);
          }
        }
      });
      if (failedTokens.length > 0) {
        const batch = db.batch();
        failedTokens.forEach(token => {
          batch.update(db.collection('deviceTokens').doc(token), { active: false });
        });
        await batch.commit();
      }
    }

    return res.status(200).json({
      success: true,
      sentCount: response.successCount,
      failureCount: response.failureCount,
    });
  } catch (error) {
    console.error('Error sending push:', error);
    return res.status(500).json({ error: error.message });
  }
}