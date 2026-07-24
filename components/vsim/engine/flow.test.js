import { describe, it, expect } from 'vitest';
import {
  ROOT_ID, subParent, childNodes, isMainNode, findNode, rootMainId, descendantIds, uid, wouldCreateCycle,
} from './flow.js';
import { isPassthrough } from './flow.js';

const DATA = {
  mainOps: [
    { id: 'm1', name: 'A', nextIds: ['m2'] },
    { id: 'm2', name: 'B', nextIds: [] },
  ],
  subOps: [
    { id: 's1', mainOpId: 'm1', nextIds: [] },          // eski format: parentId yok
    { id: 's2', parentId: 'm1', nextIds: [] },
    { id: 's3', parentId: 's2', nextIds: [] },          // iç içe: alt op'un altı
  ],
};

describe('flow yardımcıları', () => {
  it('subParent parentId yoksa mainOpId kullanır', () => {
    expect(subParent(DATA.subOps[0])).toBe('m1');
    expect(subParent(DATA.subOps[2])).toBe('s2');
  });

  it('childNodes ROOT için mainOps, konteyner için alt op döner', () => {
    expect(childNodes(DATA, ROOT_ID).map(n => n.id)).toEqual(['m1', 'm2']);
    expect(childNodes(DATA, 'm1').map(n => n.id)).toEqual(['s1', 's2']);
    expect(childNodes(DATA, 's2').map(n => n.id)).toEqual(['s3']);
    expect(childNodes(DATA, 'm2')).toEqual([]);
  });

  it('isMainNode ve findNode', () => {
    expect(isMainNode(DATA, 'm1')).toBe(true);
    expect(isMainNode(DATA, 's1')).toBe(false);
    expect(findNode(DATA, 's3').id).toBe('s3');
    expect(findNode(DATA, 'yok')).toBeNull();
  });

  it('rootMainId iç içe alt op için kök ana op döner', () => {
    expect(rootMainId(DATA, 's3')).toBe('m1');   // s3 → s2 → m1
    expect(rootMainId(DATA, 'm2')).toBe('m2');
  });

  it('descendantIds tüm torunları döner (kendisi hariç)', () => {
    expect(descendantIds(DATA, 'm1').sort()).toEqual(['s1', 's2', 's3']);
    expect(descendantIds(DATA, 'm2')).toEqual([]);
  });

  it('uid 8 karakterli string üretir', () => {
    expect(uid()).toMatch(/^[a-z0-9]{1,10}$/);
  });
});

describe('wouldCreateCycle', () => {
  const N = (id, nextIds) => ({ id, nextIds });

  it('DAG kenarına izin verir', () => {
    const nodes = [N('a', ['b']), N('b', []), N('c', [])];
    expect(wouldCreateCycle(nodes, 'b', 'c')).toBe(false);
  });

  it('2-döngüyü yakalar (b→a varken a→b)', () => {
    const nodes = [N('a', []), N('b', ['a'])];
    expect(wouldCreateCycle(nodes, 'a', 'b')).toBe(true);
  });

  it("3-döngüyü yakalar (a→b→c varken c→a)", () => {
    const nodes = [N('a', ['b']), N('b', ['c']), N('c', [])];
    expect(wouldCreateCycle(nodes, 'c', 'a')).toBe(true);
  });

  it('kendine bağlantıyı yakalar', () => {
    expect(wouldCreateCycle([N('a', [])], 'a', 'a')).toBe(true);
  });

  it('elmasta (fan-out/fan-in) yanlış alarm vermez', () => {
    const nodes = [N('x', ['y', 'z']), N('y', ['w']), N('z', ['w']), N('w', [])];
    expect(wouldCreateCycle(nodes, 'y', 'w')).toBe(false);  // zaten var olsa da döngü değil
  });

  it('liste dışına işaret eden nextIds ile çökmez', () => {
    const nodes = [N('a', ['ghost']), N('b', [])];
    expect(wouldCreateCycle(nodes, 'b', 'a')).toBe(false);
  });

  it('VERİDE kalıcı döngü varsa bile sonlanır (seen-set güvencesi)', () => {
    const nodes = [N('a', ['b']), N('b', ['a']), N('c', [])];
    expect(wouldCreateCycle(nodes, 'c', 'a')).toBe(false);
  });

  it('fromId listede yoksa false döner (henüz kaydedilmemiş düğüm)', () => {
    const nodes = [N('a', ['b']), N('b', [])];
    expect(wouldCreateCycle(nodes, 'pending_x', 'a')).toBe(false);
  });
});

describe('isPassthrough', () => {
  it('input/output kind geçirgendir, op ve tanımsız değildir', () => {
    expect(isPassthrough({ kind: 'input' })).toBe(true);
    expect(isPassthrough({ kind: 'output' })).toBe(true);
    expect(isPassthrough({ kind: 'op' })).toBe(false);
    expect(isPassthrough({})).toBe(false);
    expect(isPassthrough(null)).toBe(false);
  });
});
