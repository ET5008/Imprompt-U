import { Router } from 'express';
import healthRouter from './health';
import uploadRouter from './upload';
import sessionRouter from './session';
import sessionStartupRouter from './sessionStartup';

const router = Router();

router.use('/health', healthRouter);
router.use('/session', sessionStartupRouter);
router.use('/session', sessionRouter);
router.use('/upload', uploadRouter);

export default router;
