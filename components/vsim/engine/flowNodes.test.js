import { describe, it, expect } from 'vitest';
import { ensureFlowNodes } from './flowNodes.js';

const base = () => ({
  mainOps: [{ id: 'op2', name: 'Op2', nextIds: [] }],
  subOps: [{ id: 'usta', mainOpId: 'op2', kind: 'op', cycleTime: 15, nextIds: [] }],
});

describe('ensureFlowNodes', () => {
  it('input ve output node yoksa birer tane ekler', () => {
    const d = ensureFlowNodes(base(), 'op2');
    const kids = d.subOps.filter(s => (s.parentId ?? s.mainOpId) === 'op2');
    expect(kids.filter(s => s.kind === 'input')).toHaveLength(1);
    expect(kids.filter(s => s.kind === 'output')).toHaveLength(1);
    expect(kids.filter(s => s.kind === 'op' || !s.kind)).toHaveLength(1); // usta korunur
  });

  it('var olan input/output çoğaltılmaz (idempotent)', () => {
    let d = ensureFlowNodes(base(), 'op2');
    d = ensureFlowNodes(d, 'op2');
    const kids = d.subOps.filter(s => (s.parentId ?? s.mainOpId) === 'op2');
    expect(kids.filter(s => s.kind === 'input')).toHaveLength(1);
    expect(kids.filter(s => s.kind === 'output')).toHaveLength(1);
  });

  it('input splitType SPLIT (böl), output joinType DUP (topla) varsayılan', () => {
    const d = ensureFlowNodes(base(), 'op2');
    const kids = d.subOps.filter(s => (s.parentId ?? s.mainOpId) === 'op2');
    expect(kids.find(s => s.kind === 'input').splitType).toBe('SPLIT');
    expect(kids.find(s => s.kind === 'output').joinType).toBe('DUP');
  });
});
