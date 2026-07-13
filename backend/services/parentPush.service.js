let admin = null;
let initialized = false;

const initFirebaseAdmin = () => {
  if (initialized) return admin;
  initialized = true;

  try {
    admin = require('firebase-admin');
    if (admin.apps.length > 0) return admin;

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      });
      return admin;
    }

    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    return admin;
  } catch (err) {
    console.warn('PARENT_PUSH_DISABLED:', err?.message || err);
    admin = null;
    return null;
  }
};

const sendParentPush = async ({ tokens, title, body, notificationId, priority }) => {
  const uniqueTokens = [...new Set((tokens || []).filter(Boolean))];
  if (uniqueTokens.length === 0) {
    return { attempted: 0, successCount: 0, failureCount: 0, disabled: false };
  }

  const firebaseAdmin = initFirebaseAdmin();
  if (!firebaseAdmin) {
    return {
      attempted: uniqueTokens.length,
      successCount: 0,
      failureCount: 0,
      disabled: true,
    };
  }

  const response = await firebaseAdmin.messaging().sendEachForMulticast({
    tokens: uniqueTokens,
    notification: { title, body },
    data: {
      type: 'parent_notification',
      notificationId: String(notificationId),
      priority: priority || 'normal',
    },
    android: {
      priority: priority === 'urgent' ? 'high' : 'normal',
    },
    apns: {
      headers: {
        'apns-priority': priority === 'urgent' ? '10' : '5',
      },
    },
  });
  const successfulTokens = response.responses
    .map((item, index) => (item.success ? uniqueTokens[index] : null))
    .filter(Boolean);

  return {
    attempted: uniqueTokens.length,
    successCount: response.successCount,
    failureCount: response.failureCount,
    successfulTokens,
    disabled: false,
  };
};

module.exports = { sendParentPush };
