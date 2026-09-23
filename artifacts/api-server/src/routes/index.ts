import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pharmacyRouter from "./pharmacy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pharmacyRouter);

export default router;
