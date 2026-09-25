import { z } from "zod";

export const authRequestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(200, "Password is too long."),
});
