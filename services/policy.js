export function decideAction({ llm, order }){
  const risky = /(denuncia|reclamaci[oó]n|fraude|rgpd|amenaza|queja formal)/i;
  let action = llm.action || 'draft';

  if (llm.confidence < 0.6) action = 'handoff';
  if (risky.test(llm.reply || '')) action = 'handoff';

  if (order && order.total_paid != null){
    const over = order.total_paid > 250; // simplificado: EUR por defecto
    if (over) action = 'handoff';
  }
  return { action };
}
