/** Silence Nest Logger output in tests (expected warnings would clutter results). */
import { Logger } from '@nestjs/common';

Logger.overrideLogger(false);
