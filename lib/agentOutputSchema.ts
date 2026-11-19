import { z } from 'zod';

export const agentOutputSchema = z.object({
  segment: z.object({
    x1: z.number().min(0).max(1),
    y1: z.number().min(0).max(1),
    x2: z.number().min(0).max(1),
    y2: z.number().min(0).max(1),
  }),
  reasoning: z.string().max(450),
  affectiveLine: z.string().max(400),
  /** Risk-style: infer others’ hidden objectives from visible geometry only. */
  inferredOthersGoals: z.string().max(220),
  /** How you might subtly frustrate or bargain with others while still advancing (house-of-cards politics). */
  rivalPlay: z.string().max(220),
  emotion: z.string().max(100),
  emotionIntensity: z.number().int().min(1).max(5),
  emotionTags: z.array(z.string()).max(10).optional(),
});

export type AgentModelOutput = z.infer<typeof agentOutputSchema>;
