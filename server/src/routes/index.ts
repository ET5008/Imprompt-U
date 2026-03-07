import { Router } from 'express';
import healthRouter from './health';
import uploadRouter from './upload';
import sessionRouter from './session';

const router = Router();

router.use('/health', healthRouter);
router.use('/session', sessionRouter);

router.use('/upload', uploadRouter);

export default router;
