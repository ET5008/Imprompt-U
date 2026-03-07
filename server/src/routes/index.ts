import { Router } from 'express';
import healthRouter from './health';
import uploadRouter from './upload';

const router = Router();

router.use('/health', healthRouter);

router.use('/upload', uploadRouter);

export default router;
