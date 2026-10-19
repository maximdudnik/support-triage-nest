/**
 * DTO = Data Transfer Object: the shape of the HTTP request body.
 *
 * CONCEPT: Validate at the boundary. The global ValidationPipe (main.ts)
 * uses these class-validator decorators to reject bad input with HTTP 400
 * BEFORE it reaches the agents. `whitelist: true` strips unknown fields.
 * Length limits are also a cost control: a 1 MB "ticket" would be a
 * very expensive prompt (and a denial-of-wallet attack vector).
 *
 * (We use class-validator here because it is the Nest convention for DTOs,
 * and zod for LLM output - knowing both is useful.)
 */
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @Matches(/^ORD-\d{4,}$/, { message: 'orderId must look like ORD-1234' })
  orderId?: string;
}
