/**
 * Merkezi sunucu hata yönetimi.
 * Dahili hata mesajlarını loglar ama istemciye hiçbir zaman sızdırmaz.
 */
const sendError = (res, err, statusCode = 500, userMessage = 'Sunucu hatası oluştu.') => {
  console.error('[SERVER_ERROR]', err);
  res.status(statusCode).json({ error: userMessage });
};

module.exports = { sendError };
