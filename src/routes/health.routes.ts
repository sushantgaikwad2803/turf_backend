import { Router, type Request, type Response } from 'express';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    status: 'ok',
    message: 'Backend is running smoothly!',
  });
});

export default router;