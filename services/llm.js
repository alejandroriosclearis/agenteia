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

export async function runLLM({ system, user, context }){
  const ctx = JSON.stringify({
    customer: context.customer,
    order: context.order && {
      reference: context.order.reference, status: context.order.status,
      carrier: context.order.carrier, currency: context.order.currency, total: context.order.total_paid
    },
    shop: context.shop
  });

  let messages = [
    { role: 'user', content: `Mensaje del cliente: ${user}\n\nCTX:\n${ctx}` }
  ];

  // Haremos hasta 3 iteraciones de herramientas si Anthropic las pide
  for (let i=0; i<3; i++){
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 800,
      system,
      messages,
      tools: toolSpecs
    });

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');

    // Si el modelo devolvió contenido final en texto (JSON), intentamos parsear
    if (!toolUseBlocks.length && textBlocks.length){
      const raw = textBlocks.map(t => t.text).join('\n');
      try { return OutSchema.parse(JSON.parse(raw)); }
      catch { 
        // Fallback: envolver en JSON mínimo
        return OutSchema.parse({
          reply: raw.slice(0,1000),
          confidence: 0.6,
          action: 'draft',
          tags: ['general'],
          metadata: {}
        });
      }
    }

    // Si hay tools, ejecútalas y añade tool_result(s)
    for (const t of toolUseBlocks){
      const handler = toolHandlers[t.name];
      let result = { error: `tool ${t.name} not implemented` };
      try { result = await handler(t.input || {}); } catch(e){ result = { error: e.message }; }
      messages.push({ role: 'tool', content: [{ type:'tool_result', tool_use_id: t.id, content: JSON.stringify(result) }] });
    }

    // También pasamos cualquier texto intermedio para dar contexto
    if (textBlocks.length){
      messages.push({ role: 'assistant', content: textBlocks });
    }
  }

  // Si no conseguimos JSON válido tras 3 rondas, devolvemos borrador
  return OutSchema.parse({
    reply: 'Gracias por escribirnos. Estoy recopilando los datos para darte una respuesta precisa.',
    confidence: 0.5,
    action: 'draft',
    tags: ['fallback'],
    metadata: {}
  });
}
