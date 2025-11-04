import { buildContext, buildSystemPrompt } from './context.js';
import { runLLM } from './llm.js';
import { decideAction } from './policy.js';

export async function handleInbound({ message, email, lang, shop_id, thread_id }){
  const ctx = await buildContext({ message, email, lang, shop_id, thread_id });
  const system = buildSystemPrompt({ brand: 'TuMarca', limitEUR: 250, limitUSD: 250 });

  const llm = await runLLM({ system, user: message, context: ctx });
  const decision = decideAction({ llm, order: ctx.order });

  return {
    reply: llm.reply,
    confidence: llm.confidence,
    action: decision.action,
    tags: llm.tags || [],
    metadata: { ...(llm.metadata || {}), order_total_amount: ctx.order?.total_paid, order_currency: ctx.order?.currency || 'EUR' }
  };
}
