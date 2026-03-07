import { Router } from 'express';
import healthRouter from './health';
import sessionRouter from './session';

const router = Router();

router.use('/health', healthRouter);
router.use('/session', sessionRouter);

export default router;
