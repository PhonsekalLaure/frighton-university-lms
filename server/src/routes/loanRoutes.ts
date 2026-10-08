import { Router, Request, Response, NextFunction } from 'express';
import { sisService } from '../services/sisService.js';
import { getSupabaseAdmin } from '../config/supabase.js';

export const loanRouter = Router();

/**
 * Check patron eligibility by verifying with SIS API
 */
loanRouter.get('/verify-patron/:frightonId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { frightonId } = req.params;
    const patronStatus = await sisService.checkStudentStatus(frightonId);
    res.json(patronStatus);
  } catch (err: any) {
    res.status(err.message.includes('not found') ? 404 : 502).json({
      error: `SIS Integration check failed: ${err.message}`,
    });
  }
});

/**
 * Borrow a book - requires SIS standing verification
 */
loanRouter.post('/borrow', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { frightonId, bookId } = req.body;
    if (!frightonId || !bookId) {
      res.status(400).json({ error: 'frightonId and bookId are required' });
      return;
    }

    // Step 1: Query SIS for standing & holds
    const patronStatus = await sisService.checkStudentStatus(frightonId);
    if (!patronStatus.canBorrow) {
      res.status(403).json({
        error: 'Patron is not eligible to borrow materials due to academic status or active SIS holds',
        patronStatus,
      });
      return;
    }

    // Step 2: Issue loan record
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14); // 14-day checkout

    res.status(201).json({
      message: 'Book loan approved and registered',
      loan: {
        frightonId,
        bookId,
        borrowDate: new Date().toISOString(),
        dueDate: dueDate.toISOString(),
        status: 'active',
      },
    });
  } catch (err: any) {
    next(err);
  }
});

/**
 * Report overdue material and synchronize hold into SIS
 */
loanRouter.post('/report-overdue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { frightonId, bookTitle, fineAmount } = req.body;
    if (!frightonId || !bookTitle) {
      res.status(400).json({ error: 'frightonId and bookTitle are required' });
      return;
    }

    const holdResult = await sisService.placeHold(
      frightonId,
      `Overdue Library Book: "${bookTitle}"`,
      fineAmount || 25.0
    );

    res.json({
      message: 'Overdue hold successfully registered with SIS',
      holdResult,
    });
  } catch (err: any) {
    next(err);
  }
});
