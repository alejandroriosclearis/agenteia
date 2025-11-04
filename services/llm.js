// services/llm.js
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { toolSpecs, toolHandlers } from './tools.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OutSchema = z.object({
  reply: z.string(),
  confidence: z.number().min(0).max(1),
  action: z.enum(['auto','draft','handoff']).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional()
});

export async function runLLM({ system, user, context }) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';

  const ctx = JSON.stringify({
    customer: context.customer,
    order: context.order && {
      reference: context.order.reference,
      status: context.order.status,
      carrier: context.order.carrier,
      currency: context.order.currency,
      total: context.order.total_paid
    },
    shop: context.shop
  });

  // Mensaje inicial
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: `Mensaje del cliente: ${user}` },
        { type: 'text', text: `CTX:\n${ctx}` }
      ]
    }
  ];

  // Hasta 3 rondas de tools
  for (let i = 0; i < 3; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: 800,
      system,
      messages,
      tools: toolSpecs
    });

    // ¿Pidió herramientas?
    const toolUses = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');

    // Si no hay tool_use: intentamos parsear la salida final (texto -> JSON)
    if (toolUses.length === 0) {
      const raw = textBlocks.map(t => t.text).join('\n').trim();
      try {
        return OutSchema.parse(JSON.parse(raw));
      } catch {
        // fallback a draft si no es JSON válido
        return OutSchema.parse({
          reply: raw || 'Gracias por escribirnos. Estoy recopilando los datos para darte una respuesta precisa.',
          confidence: 0.6,
          action: 'draft',
          tags: ['general'],
          metadata: {}
        });
      }
    }

    // Ejecutar cada tool_use y construir un ÚNICO mensaje con role:'user' y bloques tool_result
    const toolResultBlocks = [];
    for (const tu of toolUses) {
      const handler = toolHandlers[tu.name];
      let result;
      try {
        result = handler ? await handler(tu.input || {}) : { error: `tool ${tu.name} not implemented` };
      } catch (e) {
        result = { error: String(e?.message || e) };
      }
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result) // texto plano; también puedes pasar array de bloques si quieres
      });
    }

    // IMPORTANTE: añadir tool_result como role:'user'
    messages.push({ role: 'user', content: toolResultBlocks });

    // (Opcional) añade también cualquier texto intermedio del assistant como contexto
    if (textBlocks.length) {
      messages.push({ role: 'assistant', content: textBlocks });
    }
  }

  // Si no consiguió cerrar en 3 rondas
  return OutSchema.parse({
    reply: 'Gracias por escribirnos. Estoy recopilando los datos para darte una respuesta precisa.',
    confidence: 0.5,
    action: 'draft',
    tags: ['fallback'],
    metadata: {}
  });
}
