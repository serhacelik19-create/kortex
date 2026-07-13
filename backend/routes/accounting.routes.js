const { sendError } = require('../utils/errorHandler');

function registerAccountingRoutes(app, deps) {
  const {
    prisma,
    authMiddleware,
    requireRole,
  } = deps;

  // Tüm muhasebe işlemlerini getir
  app.get('/api/accounting/transactions', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const where = { institutionId };

      // Tarih bazlı filtreleme
      if (req.query.startDate || req.query.endDate) {
        where.date = {};
        if (req.query.startDate) where.date.gte = new Date(req.query.startDate);
        if (req.query.endDate) where.date.lte = new Date(req.query.endDate);
      }
      // Tip filtreleme
      if (req.query.type) where.type = req.query.type;

      const transactions = await prisma.accountingTransaction.findMany({
        where,
        include: { category: true, student: true },
        orderBy: { date: 'desc' }
      });
      res.json(transactions);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Taksitleri getir (+ otomatik gecikmiş işaretleme)
  app.get('/api/accounting/installments', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;

      // Vadesi geçmiş ama hala 'pending' olan taksitleri otomatik olarak 'overdue' yap
      await prisma.studentInstallment.updateMany({
        where: {
          institutionId,
          status: 'pending',
          dueDate: { lt: new Date() }
        },
        data: { status: 'overdue' }
      });

      const installments = await prisma.studentInstallment.findMany({
        where: { institutionId },
        include: { student: true },
        orderBy: { dueDate: 'asc' }
      });
      res.json(installments);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Kategorileri getir
  app.get('/api/accounting/categories', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const categories = await prisma.accountingCategory.findMany({
        where: { institutionId },
        include: { _count: { select: { transactions: true } } }
      });
      res.json(categories);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Kategori oluştur
  app.post('/api/accounting/categories', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const { name, type } = req.body;
      const category = await prisma.accountingCategory.create({
        data: { institutionId, name, type: type || 'expense' }
      });
      res.json(category);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Kategori sil
  app.delete('/api/accounting/categories/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      await prisma.accountingCategory.delete({ where: { id: parseInt(req.params.id) } });
      res.json({ message: 'Kategori silindi.' });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Kategori bazlı dağılım raporu
  app.get('/api/accounting/category-breakdown', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const transactions = await prisma.accountingTransaction.findMany({
        where: { institutionId },
        include: { category: true }
      });
      const totalAmount = transactions.reduce((a, t) => a + t.amount, 0);
      const catMap = {};
      transactions.forEach(t => {
        const catName = t.category?.name || 'Kategorisiz';
        const catType = t.type;
        if (!catMap[catName]) catMap[catName] = { name: catName, type: catType, amount: 0 };
        catMap[catName].amount += t.amount;
      });
      const result = Object.values(catMap).map((c) => ({
        ...c,
        percentage: totalAmount > 0 ? Math.round((c.amount / totalAmount) * 100) : 0
      })).sort((a, b) => b.amount - a.amount);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Aylık gelir-gider raporu
  app.get('/api/accounting/monthly-report', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const transactions = await prisma.accountingTransaction.findMany({
        where: { institutionId },
        orderBy: { date: 'asc' }
      });

      const monthlyMap = {};
      transactions.forEach(t => {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyMap[key]) monthlyMap[key] = { month: key, gelir: 0, gider: 0 };
        if (t.type === 'income') monthlyMap[key].gelir += t.amount;
        else monthlyMap[key].gider += t.amount;
      });

      // Son 12 ayı garanti olarak göster
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyMap[key]) monthlyMap[key] = { month: key, gelir: 0, gider: 0 };
      }

      const result = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Yeni işlem ekle
  app.post('/api/accounting/transactions', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const { categoryId, amount, type, description, date, paymentMethod, studentId, installmentId } = req.body;

      const transaction = await prisma.accountingTransaction.create({
        data: {
          institutionId,
          categoryId: categoryId ? parseInt(categoryId) : null,
          amount: parseFloat(amount),
          type,
          description,
          date: date ? new Date(date) : new Date(),
          paymentMethod: paymentMethod || 'cash',
          studentId: studentId ? parseInt(studentId) : null,
          installmentId: installmentId ? parseInt(installmentId) : null
        }
      });

      // Eğer bir taksit ödemesi ise, taksit durumunu güncelle
      if (installmentId) {
        const installment = await prisma.studentInstallment.findUnique({ where: { id: parseInt(installmentId) } });
        if (installment) {
          const newPaidAmount = installment.paidAmount + parseFloat(amount);
          await prisma.studentInstallment.update({
            where: { id: parseInt(installmentId) },
            data: {
              paidAmount: newPaidAmount,
              status: newPaidAmount >= installment.amount ? 'paid' : 'partially_paid'
            }
          });
        }
      }

      res.json(transaction);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Toplu taksit oluştur
  app.post('/api/accounting/installments/bulk', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const { studentId, count, totalAmount, startDate, description } = req.body;

      if (!studentId || !count || !totalAmount) {
        return res.status(400).json({ error: 'Gerekli alanlar eksik.' });
      }

      const installmentCount = parseInt(count);
      const amountPerInstallment = Math.floor(parseFloat(totalAmount) / installmentCount);
      const remainder = parseFloat(totalAmount) % installmentCount;

      const start = new Date(startDate || new Date());
      const installments = [];

      for (let i = 0; i < installmentCount; i++) {
        const dueDate = new Date(start);
        dueDate.setMonth(start.getMonth() + i);

        const finalAmount = i === installmentCount - 1 ? amountPerInstallment + remainder : amountPerInstallment;

        installments.push({
          institutionId,
          studentId: parseInt(studentId),
          amount: finalAmount,
          dueDate,
          status: 'pending',
          description: description || `${i + 1}. Taksit`
        });
      }

      await prisma.studentInstallment.createMany({
        data: installments
      });

      res.json({ message: 'Taksitler başarıyla oluşturuldu.', count: installments.length });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Toplu taksit silme (öğrenci bazlı)
  app.delete('/api/accounting/installments/bulk/:studentId', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const studentId = parseInt(req.params.studentId);

      // Sadece hiç ödenmemiş taksitleri sil
      const deleted = await prisma.studentInstallment.deleteMany({
        where: {
          institutionId,
          studentId,
          paidAmount: 0
        }
      });

      res.json({ message: `${deleted.count} adet ödenmemiş taksit silindi.`, count: deleted.count });
    } catch (err) {
      sendError(res, err);
    }
  });

  // İşlem sil (Geri al)
  app.delete('/api/accounting/transactions/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const transaction = await prisma.accountingTransaction.findUnique({
        where: { id: transactionId }
      });

      if (!transaction) {
        return res.status(404).json({ error: 'İşlem bulunamadı.' });
      }

      // Eğer bu bir taksit ödemesi ise taksiti eski haline getir
      if (transaction.installmentId) {
        const installment = await prisma.studentInstallment.findUnique({
          where: { id: transaction.installmentId }
        });

        if (installment) {
          const newPaidAmount = Math.max(0, installment.paidAmount - transaction.amount);
          await prisma.studentInstallment.update({
            where: { id: transaction.installmentId },
            data: {
              paidAmount: newPaidAmount,
              status: newPaidAmount <= 0 ? 'pending' : 'partially_paid'
            }
          });
        }
      }

      await prisma.accountingTransaction.delete({
        where: { id: transactionId }
      });

      res.json({ message: 'İşlem başarıyla geri alındı.' });
    } catch (err) {
      sendError(res, err);
    }
  });
}

module.exports = { registerAccountingRoutes };
