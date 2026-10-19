import { Module } from '@nestjs/common';
import { OrderStatusTool } from './order-status.tool';

/** Tools are ordinary injectable providers -> mockable, swappable, testable. */
@Module({
  providers: [OrderStatusTool],
  exports: [OrderStatusTool],
})
export class ToolsModule {}
